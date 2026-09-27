"""
Shared SmartFormat template parser for entity description and general localization templates.
Unlike description_resolver, this code does not finalize strings given game data.
Instead it parsers the templates, and there are optional helpers for exporting them to ICU for the frontend
description_resolver uses this logic internally (or will, as part of the PR)
"""

from dataclasses import MISSING, dataclass, field
from enum import StrEnum, IntEnum, auto
import re
from collections.abc import Generator, Callable, Iterable, Iterator

class ComparisonOperator(StrEnum):
    GREATER_THAN = ">",
    LESS_THAN = "<",
    GREATER_THAN_OR_EQUAL = ">=",
    LESS_THAN_OR_EQUAL = "<=",
    EQUAL = "==",
    NOT_EQUAL = "!=",
@dataclass(frozen=True)
class MessageCondition:
    operator: ComparisonOperator
    threshold: int
# todo: we can skip generating some of these tokens by yielding more specific tokens in some cases
class DelimiterKind(StrEnum):
    BRACE_OPEN = '{',
    BRACE_CLOSE = '}',
    PAREN_OPEN = '(',
    PAREN_CLOSE = ')',
    BAR = '|',
    COLON = ':',
    END = '',
class TextKind(IntEnum):
    GENERIC = 0,
    VARIABLE = auto(),
    FUNCTION = auto(),
    ARGUMENT = auto(),
class ConditionKind(StrEnum):
    CONDITION = "cond",
class TokenizerState(IntEnum):
    TEMPLATE = 0,
    PARAMETER = auto(),
    SUBTEMPLATE = auto(),
    FUNCTION_OR_SUBTEMPLATE = auto(),
    ARGUMENTS = auto(),
    CONDITION_OR_SUBTEMPLATE = auto(),
    
type TokenKind = DelimiterKind | TextKind | ConditionKind
type Token = tuple[DelimiterKind, None, int] | tuple[TextKind, str, int] | tuple[ConditionKind, MessageCondition, int]

class MessageParseError(Exception):
    """
        A None position implies end of message. Used by a wrapper to visualise where the error is in the message
    """
    def __init__(self, message: str, position: int | None = None):
        super.__init__(message)
        self.position = position
class MessageTokenizationError(MessageParseError):
    """
        A None position implies end of message. Used by a wrapper to visualise where the error is in the message
    """
    def __init__(self, state: TokenizerState, position: int | None = None):
        super.__init__(f"Could not find a delimiter that satifies the state/rule: {state.name}.")
        self.position = position
class UnexpectedTokenError(MessageParseError):
    def __init__(self, token: Token | None, expectation: str):
        match token:
            case None:
                result = "end of message"
                position = None
            case (kind, value, pos):
                position = pos
                if kind in DelimiterKind._value2member_map_:
                    result = f"{kind.value}"
                else:
                    result = f"{kind.name}({value})"
        super.__init__(f"Expected {expectation} but got {result}.", position)

type ParsedMessage = list[str | TemplateParameter]

def fn_name_field(value: str | None = None):
    return field(default=value, kw_only=True)

@dataclass(frozen=True)
class ConditionalMessage:
    condition: MessageCondition | None
    content: ParsedMessage
@dataclass(frozen=True)
class TemplateParameter:
    """If not subclassed it really is as simple as {var}"""
    variable: str
@dataclass(frozen=True)
class FunctionParameter(TemplateParameter):
    """
    Complex parameters with a name(<args>?) form.
    Those that are not subclassed can generally be considered to call some custom code, and will generally need to be converted to custom [bb] code to be resolvable on the frontend.
    Note: 'choose' does not count as it maps more simply to an ICU select
    """
    fn_name: str | None = fn_name_field(MISSING)
@dataclass(frozen=True)
class RepeatParameter(FunctionParameter):
    """
    Namely energyIcons and starIcons
    """
    n: int | None
@dataclass(frozen=True)
class SelectionParameter(FunctionParameter):
    """
        Basically a Conditional without the explict coditions. Selections are made hueristically (or customisably) based on the arg type.

        Note: IfUpgraded is a special case of the SelectionParameter.
        In plain text it would be the same result, but in practice we should be showing green upgrade text in the upgraded cases.
        I.e. they are written like: {IfUpgraded:show:<upgradedcase>|<normalcase>}
        But should print like they were instead: {IfUpgraded:[upgraded]<upgradedcase>[/upgraded]|<normalcase>}
        In principle the IfUpgraded should be qualified as a CustomParameter, but it's probably going to be easier to manually check for the varname and unroll it like an IfElse with injected bb code
        I'm not sure if the upgraded bb code should be [upgraded] or just [green] but we can decide that later

        Note: plural is also captured as Selection in this parser
        """
    options: list[ParsedMessage]
@dataclass(frozen=True)
class ConditionParameter(FunctionParameter):
    """
    Not a subclass of SelectionParameter because of the conflicting option type.
    Kind of like ICU plurals but more specific.
    This will be trickier to translate into ICU than most of the others, but I think RuleBasedNumberFormat would work?
    """
    options: list[ConditionalMessage]
    fn_name: str = fn_name_field("cond")
@dataclass(frozen=True)
class ChooseParameter(SelectionParameter):
    keys: list[str]
    fn_name: str = fn_name_field("choose")

#Note: the rest of the known functions are zero-arg FunctionParameters. They can be built inline in parse_mesage and will need to be output as custom bbcode in the form [fn_name:{var}].

def parse_cond_expression(expression: str) -> MessageCondition:
    """Convert a SmartFormat condition like >1, ==1, >=5 into a callable lambda"""
    parts = re.match(r"(>=|<=|!=|>|<|==)\s*(\d+)", expression)
    if not parts:
        raise SyntaxError("Expected 'cond' function to be a numerical comparison but got {condition}.")
    op, threshold = ComparisonOperator._value2member_map_[parts.group(1)], int(parts.group(2))
    if op is None:
        raise ValueError(f"Unrecognised cond operator '{op}'.")

    return MessageCondition(op, threshold)

WORD_REGEX = re.compile(r"\w+")

def tokenize(message: str) -> Generator[Token, None, None]:
    """
    Generates a stream of tokens from the original message.
    This tokenizer is kind of halfway between a pure tokenizer and a parser in that it needs a well informed state machine to inform appropriate token delimiters
    But this tokenizer is still more permissive than it needs to be, partly to keep it simple but mostly because it makes it relatively easier to create relatively better error messages
    todo: not sure off the top of my head if the game uses \{ or {{ escapes, but that can easily be fixed later.
    """
    states: list[TokenizerState] = []
    length = len(message)
    position = 0
    while position < length:
        state = states.pop() if len(states) > 0 else TokenizerState.TEMPLATE
        try:
            match state:
                case TokenizerState.TEMPLATE:
                    delimiter_pos = message.find(r"(?<!\\)\{")
                    if delimiter_pos == -1:
                        yield (TextKind.GENERIC, message[position:])
                        position = length
                    else:
                        if delimiter_pos > position:
                            yield (TextKind.GENERIC, message[position:delimiter_pos], position)
                        yield (DelimiterKind.BRACE_OPEN,None,delimiter_pos)
                        position = delimiter_pos + 1
                        states.append(TokenizerState.PARAMETER)
                case TokenizerState.PARAMETER:
                    # now looking for a parameter/var name
                    delimiter_pos = message.index(r"(?<!\\)[:}]")
                    delimiter = message[delimiter_pos]
                    if delimiter_pos > position:
                        yield (TextKind.VARIABLE, message[position:delimiter_pos], position)
                    match delimiter:
                        case "}":
                            yield (DelimiterKind.BRACE_CLOSE, None, delimiter_pos)
                        case ":":
                            yield (DelimiterKind.COLON, None, delimiter_pos)
                            state.append(TokenizerState.FUNCTION_OR_SUBTEMPLATE)
                    position = delimiter_pos + 1
                case TokenizerState.FUNCTION_OR_SUBTEMPLATE:
                    # a potential function name will be exactly a word
                    function_match = WORD_REGEX.match(message, position)
                    if function_match is None:
                        states.append(TokenizerState.SUBTEMPLATE)
                    else:
                        delimiter_pos = position + function_match.span()
                        delimiter = message[delimiter_pos]
                        match delimiter:
                            case "(" | ":":
                                function_name = function_match.group()
                                yield (TextKind.FUNCTION, function_name, position)
                                position = delimiter_pos + 1
                                match delimiter:
                                    case "(":
                                        yield (DelimiterKind.PAREN_OPEN, None, delimiter_pos)
                                        states.append(TokenizerState.ARGUMENTS)
                                    case ":":
                                        yield (DelimiterKind.COLON, None, delimiter_pos)
                                        # note: this is the only known special case where knowing the function name seems to affect parsing
                                        states.append(TokenizerState.CONDITION_OR_SUBTEMPLATE if function_name == "cond" else TokenizerState.SUBTEMPLATE)
                            case "}":
                                # note: this outcome is redundant at best if not illegal, but balancing the brace here will lead to more precise error locations anyway
                                yield (DelimiterKind.PAREN_CLOSE, None, delimiter_pos)
                            case _:
                                states.append(TokenizerState.SUBTEMPLATE)
                case TokenizerState.ARGUMENTS:
                    delimiter_pos = message.index(r"(?<!\\)[|)}]")
                    delimiter = message[delimiter_pos]
                    if delimiter_pos > position:
                        yield (TextKind.ARGUMENT, message[position:delimiter_pos], position)
                    position = delimiter_pos + 1
                    match delimiter:
                        case "|":
                            yield (DelimiterKind.BAR, None, delimiter_pos)
                            states.append(TokenizerState.ARGUMENTS)
                        case ")":
                            yield (DelimiterKind.PAREN_CLOSE, None, delimiter_pos)
                            states.append(TokenizerState.SUBTEMPLATE)
                        case "}":
                            # note: this outcome is definitely illegal, but we get more precise token information by gracefully handling it in the tokenizer, and it would facilitate a degree of error recovery if ever we wanted it.
                            yield (DelimiterKind.PAREN_CLOSE, None, delimiter_pos)
                case TokenizerState.CONDITION_OR_SUBTEMPLATE:
                    # this is a kind of peek ahead: we're matching against ? or whatever subtemplate would match
                    delimiter_pos = message.index(r"(?<!\\)[\?|\{\}]")
                    delimiter = message[delimiter_pos]
                    # note: we consume the ? entirely, no point in emitting it as a token
                    if delimiter == "?":
                        yield (ConditionKind.CONDITION, parse_cond_expression(message[position:delimiter_pos]), position)
                        position = delimiter_pos + 1
                        # double stack state instead of duplicating the code for PARAM_OPTION
                        # by only double pushing when we get a match, we prevent an infinite loop
                        states.append(TokenizerState.CONDITION_OR_SUBTEMPLATE)
                    # regardless of whether or not we got a condition, the next step is to build a subtemplate
                    states.append(TokenizerState.SUBTEMPLATE)
                case TokenizerState.SUBTEMPLATE:
                    delimiter_pos = message.index(r"(?<!\\)[|\{\}]")
                    delimiter = message[delimiter_pos]
                    if delimiter_pos > position:
                        yield (TextKind.GENERIC, message[position:delimiter_pos], position)
                    position = delimiter_pos + 1
                    match delimiter:
                        case "|":
                            yield (DelimiterKind.BAR, None, delimiter_pos)
                            if states[-1] != TokenizerState.CONDITION_OR_SUBTEMPLATE:
                                states.append(TokenizerState.SUBTEMPLATE)
                        case "{":
                            yield (DelimiterKind.BRACE_OPEN, None, delimiter_pos)
                            states.append(TokenizerState.PARAMETER)
                        case "}":
                            yield (DelimiterKind.BRACE_CLOSE, None, delimiter_pos)
        except ValueError as exec: 
            raise MessageTokenizationError(state, position) from exec

def parse_message(
    message: str
) -> ParsedMessage:
    """
    Parse SmartFormat templates in descriptions and other messages into resolvable parameters. Fail-fast.
    As far as we know the syntax for the game's messages is approximately:
    TEMPLATE = { text | PARAMETER },
    PARAMETER = "{", variable, [ FUNCTION_OR_SUBTEMPLATE ], "}"
    FUNCTION_OR_SUBTEMPLATE = ":", ( "cond", ":", CONDITION_OR_SUBTEMPLATE | [ function, [ "(", [ ARGUMENTS ], ")", ], ":", SUBTEMPLATE, ] | SUBTEMPLATE )
    ARGUMENTS = word, { "|", word }
    CONDITION_OR_SUBTEMPLATE = [ CONDITION, TEMPLATE, { "|", CONDITION, TEMPLATE } ], [ TEMPLATE ]
    SUBTEMPLATE = TEMPLATE, { "|", TEMPLATE }
    CONDITION = CONDITION_OP, int
    CONDITION_OP = ">" | "<" | ">=" | "<=" | "==" | "!="

    The tokenizer is smart enough to process most of this but is deliberately permissive about a few things (most notably premature closer of a malformed parameter).

    Note: Although SmartFormat itself is more complex, the game only utilises a specific subset (as far as we know).
    This implementation can be made more perissive though, especially e.g. around whitespace in certain places.
    """
    tokens = tokenize(message)
    current: Token | None = next(tokens)

    def consume(delimiter: DelimiterKind):
        """
        Consumes the next yield from tokens and raises an UnexpectedTokenError if it is not for the expected delimiter
        """
        match next(tokens):
            case (delimiter, _, _):
                pass
            case bad:
                raise UnexpectedTokenError(bad, delimiter.value)
    def collect_message() -> ParsedMessage:
        """
        Potentially recursive token-to-template parsing
        """
        nonlocal current
        result = []
        while True:
            match current:
                case (TextKind.GENERIC, value, _):
                    result.append(value)
                case (DelimiterKind.BRACE_OPEN, _, _):
                    result.append(collect_parameter())
                case _:
                    return result
            current = next(tokens)
    def generate_options() -> Generator[ParsedMessage, None, None]:
        """
        Returns a token if there are more options to gather, though the token is always a | delimiter, it's positional information is useful for error messaging.
        It yields at least n+1 messages for n occurances of | bar. This is correct because in most cases the game data will explicitly have empty final options (although there are exceptions).
        Including or omitting the final bar on an empty option makes little practical difference except for trying to perfectly reproduce inputs as a quick way of testing.
        The case where there are 0 options never appears in input anyway.
        """
        nonlocal current
        current = next(tokens)
        while True:
            template = collect_message()
            yield template
            match current[0]:
                case DelimiterKind.BRACE_CLOSE:
                    break
                case DelimiterKind.BAR:
                    current = next(tokens)
                case _:
                    raise UnexpectedTokenError(current, "a template option starting with either be text or a parameter")
    def collect_options() -> list[ParsedMessage]:
        """Using a generator for the base implementation makes it easier to blend with conditional options"""
        return list(generate_options)
    def collect_conditional_options() -> list[ConditionalMessage]:
        nonlocal current
        result = []
        options = generate_options()
        while True:
            match current:
                case (ConditionKind.CONDITION, condition, _):
                    current = next(tokens)
                    result.append(ConditionalMessage(condition, next(options)))
                    current = next(tokens)
                case (DelimiterKind.BRACE_CLOSE, _, _):
                    # this isn't quite redundant as it makes it easier to reproduce whether or not the original input had a | after the final non-empty option
                    break
                case _:
                    result.append(ConditionalMessage(None, next(options)))
                    match current:
                        case (DelimiterKind.BRACE_CLOSE, _, _):
                            break
                        case _:
                            raise UnexpectedTokenError(current, "the 'cond' parameter to end after the first unconditional option")
        return result
    def collect_keys() -> list[str]:
        had_arg = False
        seen: set[str] = set()
        while True:
            match next(tokens):
                case (DelimiterKind.PAREN_CLOSE, _, _) if had_arg:
                    break               
                case (DelimiterKind.BAR, _, _) if had_arg:
                    had_arg = False
                case (TextKind.ARGUMENT, arg, _) if not had_arg and arg not in seen:
                    seen.add(arg)
                    had_arg = True
                case bad if had_arg:
                    raise UnexpectedTokenError(bad, "'|' or ')")
                case bad:
                    raise UnexpectedTokenError(bad, "a unique and non-empty argument")
        return list(seen)
    def collect_parameter() -> TemplateParameter:
        nonlocal current
        match next(tokens):
            case (TextKind.VARIABLE, var_name, _):
                match next(tokens):
                    case (TextKind.COLON, _, _):
                        match next(tokens):
                            case (TextKind.FUNCTION, fn_name, position):
                                match fn_name:
                                    case "show" | "cond" | "pural":
                                        consume(DelimiterKind.COLON)
                                        match fn_name:
                                            case "cond":
                                                result = ConditionParameter(var_name, collect_conditional_options())
                                            case _:
                                                result = SelectionParameter(var_name, collect_options(), fn_name=fn_name)
                                    case _:
                                        # all other functions are assumed to take the name() form
                                        consume(DelimiterKind.PAREN_OPEN)
                                        match fn_name:
                                            case "choose":
                                                # this is the only name() form function that takes options
                                                keys = collect_keys()
                                                consume(DelimiterKind.PAREN_CLOSE)
                                                consume(DelimiterKind.COLON)
                                                options = collect_options()
                                                if len(options) != len(keys):
                                                    # todo: we could decide to be permissive if the game has n-1 options for n keys, but for now I'd prefer to find out if that is ever the case.
                                                    raise MessageParseError(f"Expected {len(keys)} message options (for {len(keys)} 'choose' keys) but got {len(options)}.", current[2])
                                                result = ChooseParameter(var_name, keys, options)
                                            case _:
                                                match fn_name:
                                                    case "energyIcons" | "starIcons":
                                                        match next(tokens):
                                                            case (TextKind.ARGUMENT, arg, position):
                                                                try:
                                                                    n = int(arg)
                                                                except exec:
                                                                    raise MessageParseError("Invalid integer argument", position) from exec
                                                                consume(DelimiterKind.PAREN_CLOSE)
                                                            case (DelimiterKind.PAREN_CLOSE, _, _):
                                                                n = None
                                                            case bad:
                                                                raise UnexpectedTokenError(bad, "an integer or ')'")
                                                        result = RepeatParameter(var_name, n, fn_name=fn_name)
                                                    case _:
                                                        # the rest of these are simple name() functions
                                                        match fn_name:
                                                            case "diff" | "inverseDiff" | "percentLess" | "percentMore":
                                                                result = FunctionParameter(var_name, fn_name=fn_name)
                                                                consume(DelimiterKind.PAREN_CLOSE)
                                                            case _:
                                                                raise MessageParseError(f"Unrecognised template function {fn_name}", position)
                                                current = next(tokens) #all the other parameters have options and therefore proceed current up to a }
                            case other:
                                current = other
                                options = collect_options()
                                if 1 <= len(options) <= 2:
                                    result = SelectionParameter(var_name, options)
                                else:
                                    raise MessageParseError(f"Expected 1-2 message options for an IfElse parameter but got {len(options)}.", current[2])
                    case (TextKind.BRACE_CLOSE, _, _):
                        result = TemplateParameter(var_name)
                    case bad:
                        raise UnexpectedTokenError(bad, "':' or '}}' after a parameter's variable name")
            case bad:
                raise UnexpectedTokenError(bad, "a variable name but got {kind.name}({value})")
        # note: this check is redundant in the event of a simple parameter,
        # but doing it at the outermost level is more fail-fast and reduces the risk of the rest of the code being accidentally incomplete
        match current:
            case (DelimiterKind.BRACE_CLOSE, _, _):
                current = next(tokens) # skip past the } we confirmed to exist above
            case bad:
                raise UnexpectedTokenError(current, "a '}' to end the parameter")
        return result
    try:
        result = collect_message()
        if current is not None:
            raise UnexpectedTokenError(current, "end of message")
        return result
    except MessageParseError as exec:
        position = exec.position or len(message)
        raise MessageParseError(
f"""Failed to parse message. A problem was found at position {position}:
{message}
{"-" * (max(0, position - 1))}^
"""
        ) from exec

# todo: write a helper for converting to ICU

def unparse_message(parsed: ParsedMessage) -> str:
    """
    A helper that compiles a ParsedMessage back into the game's original syntax.
    Mainly useful for testing/validating the implementation of parse_message(str).

    Note: Theoretically, currently, it should be able to reproduce inputs exactly.
    SmartFormat is more permissive than that would allow but the game might not actually leverage that permissiveness.
    Even if that does occur in future the parser 
    """
    return ''.join(unparse_message_recursively(parsed))

# Note: the rest of this file is deceptively simple for how long it is and is internal helpers for the above

def unparse_message_recursively(parsed: ParsedMessage) -> Generator[str, None, None]:
    """
    The generator form is genuinely more efficient for recursion
    """
    def inject_bars(content: Generator[str, None, None]):
        each = next(content)
        while each is not None:
            yield each
            each = next(content)
            if each is not None:
                yield "|"
    for part in parsed:
        match part:
            case text if isinstance(text, str):
                yield text
            case RepeatParameter(variable, n, fn_name=fn_name):
                yield "{",
                yield variable
                yield ":"
                yield fn_name
                yield "("
                yield "" if n is None else n
                yield ")}"
            case ConditionParameter(variable, options, fn_name=fn_name):
                yield "{"
                yield variable
                yield ":"
                yield fn_name
                yield ":"
                yield from inject_bars(unparse_conditional_message(options))
                yield "}"
            case ChooseParameter(variable, options, keys, fn_name=fn_name):
                yield "{"
                yield variable
                yield ":"
                yield fn_name
                yield "("
                yield from inject_bars(keys)
                yield ")"
                yield ":"
                yield from inject_bars(map(unparse_message_recursively, options))
                yield "}"
            case SelectionParameter(variable, options, keys, fn_name=fn_name):
                yield "{"
                yield variable
                yield ":"
                yield fn_name
                yield ":"
                inject_bars(map(unparse_message_recursively, options))
                yield "}"
            case FunctionParameter(variable, fn_name=fn_name):
                yield "{"
                yield variable
                yield ":"
                yield fn_name
                yield "()}"
            case TemplateParameter(variable):
                yield "{"
                yield variable
                yield "}"
def unparse_conditional_message(message: ConditionalMessage) -> Generator[str, None, None]:
    if message.condition is not None:
        yield message.condition.operator.value
        yield message.condition.threshold
        yield "?"
        yield unparse_message_recursively(message.content)