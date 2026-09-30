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

from app.parsers.description_resolver import _lookup

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
class LexerState(IntEnum):
    TEMPLATE = 0,
    PLACEHOLDER = auto(),
    ARGUMENTS = auto(),
    ARGUMENTS_END = auto(),
    ARGUMENTS_END_SCANNED = auto(),
    SUBTEMPLATE = auto(),
    SUBTEMPLATE_SCANNED = auto(),
    FUNCTION_OR_SUBTEMPLATE = auto(),
    CONDITION_OR_SUBTEMPLATE = auto(),
    
type TokenKind = DelimiterKind | TextKind | ConditionKind
type Token = tuple[DelimiterKind, None, int] | tuple[TextKind, str, int] | tuple[ConditionKind, MessageCondition, int]

class MessageSyntaxError(Exception):
    """
        A None position implies end of message. Used by a wrapper to visualise where the error is in the message
    """
    def __init__(self, message: str, position: int | None = None):
        super().__init__(message)
        self.position = position
class LexicalError(MessageSyntaxError):
    """
        A None position implies end of message. Used by a wrapper to visualise where the error is in the message
    """
    def __init__(self, state: LexerState, position: int | None = None):
        super().__init__(f"Could not find a delimiter that satifies the state/rule: {state.name}.")
        self.position = position
class UnexpectedTokenError(MessageSyntaxError):
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
            case bad:
                raise ValueError(f"what the hell is this: {bad}")
        super().__init__(f"Expected {expectation} but got {result}.", position)

type ParsedMessage = list[str | Placeholder]

def fn_name_field(value: str | None = None):
    return field(default=value, kw_only=True)

@dataclass(frozen=True)
class ConditionalMessage:
    condition: MessageCondition | None
    content: ParsedMessage
@dataclass(frozen=True)
class Placeholder:
    """If not subclassed it really is as simple as {var}. However variable can be None (special {} placeholder)"""
    """
    Pseudo-abstract base type
    """
    variable: str | None
@dataclass(frozen=True)
class FunctionPlaceholder(Placeholder):
    """
    Complex placeholders with a name(<args>?) form.
    Those that are not subclassed can generally be considered to call some custom code, and will generally need to be converted to custom [bb] code to be resolvable on the frontend.
    Note: 'choose' does not count as it maps more simply to an ICU select
    """
    fn_name: str | None = fn_name_field(MISSING)
@dataclass(frozen=True)
class RepeatPlaceholder(FunctionPlaceholder):
    """
    Namely energyIcons and starIcons
    """
    n: int | None
@dataclass(frozen=True)
class ConditionalPlaceholder(FunctionPlaceholder):
    fn_name: str | None = fn_name_field(None)
    """
        Basically a Conditional without the explict coditions. Selections are made hueristically (or customisably) based on the arg type and also the function name if present.

        Note: IfUpgraded is a special case of the ConditionPlaceholder.
        In plain text it would be the same result, but in practice we should be showing green upgrade text in the upgraded cases.
        I.e. they are written like: {IfUpgraded:show:<upgradedcase>|<normalcase>}
        But should print like they were instead: {IfUpgraded:[upgraded]<upgradedcase>[/upgraded]|<normalcase>}
        In principle the IfUpgraded should be qualified as a CustomPlaceholder, but it's probably going to be easier to manually check for the varname and unroll it like an IfElse with injected bb code
        I'm not sure if the upgraded bb code should be [upgraded] or just [green] but we can decide that later

        Note: plural is also captured as Selection in this parser
        """
    options: list[ParsedMessage]
@dataclass(frozen=True)
class NumericConditionPlaceholder(FunctionPlaceholder):
    fn_name: str = fn_name_field("cond")
    """
    Not a subclass of ConditionPlaceholder because of the conflicting option type.
    Kind of like ICU plurals but more specific.
    This will be trickier to translate into ICU than most of the others, but I think RuleBasedNumberFormat would work?
    """
    options: list[ConditionalMessage]
@dataclass(frozen=True)
class ChoosePlaceholder(ConditionalPlaceholder):
    fn_name: str = fn_name_field("choose")
    keys: list[str]
#Note: the rest of the known functions are zero-arg FunctionPlaceholders. They can be built inline in parse_mesage and will need to be output as custom bbcode in the form [fn_name:{var}].

def parse_cond_expression(expression: str) -> MessageCondition:
    """Convert a SmartFormat condition like >1, ==1, >=5 into a callable lambda"""
    parts = re.match(r"(>=|<=|!=|>|<|==)\s*(\d+)", expression)
    if not parts:
        raise SyntaxError("Expected 'cond' function to be a numerical comparison but got {condition}.")
    op, threshold = ComparisonOperator._value2member_map_[parts.group(1)], int(parts.group(2))
    if op is None:
        raise ValueError(f"Unrecognised cond operator '{op}'.")

    return MessageCondition(op, threshold)
WORD_CHAR_REGEX = re.compile(r"\w")
def lex(message: str) -> Generator[Token, None, None]:
    """
    Generates a stream of tokens from the original message.
    This lexer is kind of halfway between a pure lexer and a parser in that it needs a well informed state machine to inform appropriate token delimiters
    But this lexer is still more permissive than it needs to be, partly to keep it simple but mostly because it makes it relatively easier to create relatively better error messages
    todo: not sure off the top of my head if the game uses \\{ or {{ escapes, but that can easily be fixed later.
    """
    states: list[LexerState] = [LexerState.TEMPLATE]
    state: LexerState
    delimiter: str = ''
    fragment: str = ''
    position = 0
    delimiter_pos = -1

    def scan(*targets: str):
        nonlocal position, delimiter_pos, delimiter, fragment
        for i in range(position, len(message)):
            if message[i] in targets and (i == 0 or (message[i-1] != "\\" and (message[i] != "{" or message[i-1] != "{"))):
                delimiter = message[i]
                fragment = message[position:i]
                delimiter_pos = i
                return
        raise LexicalError(state, position)
    while len(states) > 0:
        position = delimiter_pos + 1
        state = states.pop()
        match state:
            case LexerState.TEMPLATE:
                try:
                    scan("{")
                    states.append(LexerState.TEMPLATE)
                    if fragment:
                        yield (TextKind.GENERIC, fragment, position)
                    yield (DelimiterKind.BRACE_OPEN, None, delimiter_pos)
                    states.append(LexerState.PLACEHOLDER)
                except LexicalError:
                    yield (TextKind.GENERIC, message[position:], position)
            case LexerState.PLACEHOLDER:
                scan(":", "}")
                if fragment:
                    yield (TextKind.VARIABLE, fragment, position)
                match delimiter:
                    case ":":
                        yield (DelimiterKind.COLON, None, delimiter_pos)
                        states.append(LexerState.FUNCTION_OR_SUBTEMPLATE)
                    case "}":
                        yield (DelimiterKind.BRACE_CLOSE, None, delimiter_pos)
            case LexerState.FUNCTION_OR_SUBTEMPLATE:
                if WORD_CHAR_REGEX.match(message[position]):
                    scan("(", ":", "|", "{", "}")
                    match delimiter:
                        case "|" | "{" | "}": # valid "fall-through" scenario.
                            states.append(LexerState.SUBTEMPLATE_SCANNED)
                        case _:
                            if fragment:
                                yield (TextKind.FUNCTION, fragment, position)
                            match delimiter:
                                case "(":
                                    yield (DelimiterKind.PAREN_OPEN, None, delimiter_pos)
                                    states.append(LexerState.ARGUMENTS)
                                case ":":
                                    yield (DelimiterKind.COLON, None, delimiter_pos)
                                    # note: this is the only known special case where knowing the function name seems to affect parsing
                                    states.append(LexerState.CONDITION_OR_SUBTEMPLATE if fragment == "cond" else LexerState.SUBTEMPLATE)
                else:
                    states.append(LexerState.SUBTEMPLATE)
            case LexerState.ARGUMENTS:
                scan("|", ")", ":", "{", "}")
                match delimiter:
                    case  ":" | "{", "}": # pseudo-error recovery (better error position info)
                        states.append(LexerState.ARGUMENTS_END_SCANNED)
                    case _:
                        if fragment:
                            yield (TextKind.ARGUMENT, fragment, position)
                        match delimiter:
                            case "|":
                                yield (DelimiterKind.BAR, None, delimiter_pos)
                                states.append(LexerState.ARGUMENTS)
                            case ")":
                                yield (DelimiterKind.PAREN_CLOSE, None, delimiter_pos)
                                states.append(LexerState.ARGUMENTS_END)
            case LexerState.ARGUMENTS_END:
                scan(":", "|", "{", "}")
                states.append(LexerState.ARGUMENTS_END_SCANNED)
            case LexerState.ARGUMENTS_END_SCANNED:
                match delimiter:
                    case ":":
                        yield (DelimiterKind.COLON, None, delimiter_pos)
                        states.append(LexerState.SUBTEMPLATE)
                    case _: # pseudo-error recovery (better error position info)
                        states.append(LexerState.SUBTEMPLATE_SCANNED)
            case LexerState.CONDITION_OR_SUBTEMPLATE:
                scan("?", "|", "{", "}")
                match delimiter:
                    case "?":
                        yield (ConditionKind.CONDITION, parse_cond_expression(fragment), position)
                        states.append(LexerState.CONDITION_OR_SUBTEMPLATE)
                        states.append(LexerState.SUBTEMPLATE)
                    case _:
                        states.append(LexerState.SUBTEMPLATE_SCANNED)
            case LexerState.SUBTEMPLATE:
                scan("|", "{", "}")
                states.append(LexerState.SUBTEMPLATE_SCANNED)
            case LexerState.SUBTEMPLATE_SCANNED:
                if fragment:
                    yield (TextKind.GENERIC, fragment, position)
                match delimiter:
                    case "}":
                        yield (DelimiterKind.BRACE_CLOSE, None, delimiter_pos)
                    case _:
                        if states[-1] != LexerState.CONDITION_OR_SUBTEMPLATE:
                            states.append(LexerState.SUBTEMPLATE)
                        match delimiter:
                            case "|":
                                yield (DelimiterKind.BAR, None, delimiter_pos)
                            case "{":
                                yield (DelimiterKind.BRACE_OPEN, None, delimiter_pos)
                                states.append(LexerState.PLACEHOLDER)

def parse(
    message: str
) -> ParsedMessage:
    """
    Parse SmartFormat templates in descriptions and other messages into resolvable placeholders. Fail-fast.
    As far as we know the syntax for the game's messages is approximately:
    TEMPLATE = { text | PLACEHOLDER },
    PLACEHOLDER = "{", CURRENT_OR_NAMED
    CURRENT_OR_NAMED = "}" | NAMED_PLACEHOLDER
    PLACEHOLDER = "{", variable, [ FUNCTION_OR_SUBTEMPLATE ], "}"
    FUNCTION_OR_SUBTEMPLATE = ":", ( "cond", ":", CONDITION_OR_SUBTEMPLATE | [ function, [ "(", [ ARGUMENTS ], ")", ], ":", SUBTEMPLATE, ] | SUBTEMPLATE )
    ARGUMENTS = word, { "|", word }
    CONDITION_OR_SUBTEMPLATE = [ CONDITION, TEMPLATE, { "|", CONDITION, TEMPLATE } ], [ TEMPLATE ]
    SUBTEMPLATE = TEMPLATE, { "|", TEMPLATE }
    CONDITION = CONDITION_OP, int
    CONDITION_OP = ">" | "<" | ">=" | "<=" | "==" | "!="

    The lexer is smart enough to process most of this but is deliberately permissive about a few things (most notably premature closer of a malformed placeholder).

    Note: Although SmartFormat itself is more complex, the game only utilises a specific subset (as far as we know).
    This implementation can be made more perissive though, especially e.g. around whitespace in certain places.
    """
    tokens = lex(message)
    current: Token | None 
    def advance():
        nonlocal current
        current = next(tokens, None)
        return current
    advance()
    def consume(expected: DelimiterKind):
        """
        Consumes the next yield from tokens and raises an UnexpectedTokenError if it is not for the expected delimiter
        """
        match advance():
            case (kind, _, _) if kind == expected:
                pass
            case bad:
                raise UnexpectedTokenError(bad, expected)
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
                    advance()
                case (DelimiterKind.BRACE_OPEN, _, _):
                    result.append(collect_placeholder())
                case _:
                    return result
    def generate_options() -> Generator[ParsedMessage, None, None]:
        """
        Returns a token if there are more options to gather, though the token is always a | delimiter, it's positional information is useful for error messaging.
        It yields at least n+1 messages for n occurances of | bar. This is correct because in most cases the game data will explicitly have empty final options (although there are exceptions).
        Including or omitting the final bar on an empty option makes little practical difference except for trying to perfectly reproduce inputs as a quick way of testing.
        The case where there are 0 options never appears in input anyway.
        """
        nonlocal current
        while True:
            template = collect_message()
            match current[0]:
                case DelimiterKind.BRACE_CLOSE:
                    yield template
                    break
                case DelimiterKind.BAR:
                    advance()
                    yield template
                case _:
                    raise UnexpectedTokenError(current, "a template option starting with either be text or a placeholder")
    def collect_options() -> list[ParsedMessage]:
        """Using a generator for the base implementation makes it easier to blend with conditional options"""
        return list(generate_options())
    def collect_conditional_options() -> list[ConditionalMessage]:
        nonlocal current
        result = []
        options = generate_options()
        saw_unconditional = False
        while True:
            match current:
                case (ConditionKind.CONDITION, condition, _):
                    if saw_unconditional:
                        raise UnexpectedTokenError(current, "to see no more complex (<n?) conditions after the first simple/else case of a numerical condition placeholder")
                    advance()
                case _:
                    saw_unconditional = True
                    condition = None
            option = next(options, None)
            if option is None:
                break
            result.append(ConditionalMessage(condition, option))
        return result
    def collect_keys() -> list[str]:
        had_arg = False
        seen: set[str] = set()
        result: list[str] = []
        while True:
            match advance():
                case (DelimiterKind.PAREN_CLOSE, _, _) if had_arg:
                    break               
                case (DelimiterKind.BAR, _, _) if had_arg:
                    had_arg = False
                case (TextKind.ARGUMENT, arg, _) if not had_arg and arg not in seen:
                    seen.add(arg)
                    result.append(arg)
                    had_arg = True
                case bad if had_arg:
                    raise UnexpectedTokenError(bad, "'|' or ')")
                case bad:
                    raise UnexpectedTokenError(bad, "a unique and non-empty argument")
        return result
    def collect_placeholder() -> Placeholder:
        match advance():
            case (TextKind.VARIABLE | DelimiterKind.COLON, var_name, _): # note: kind of abusing the fact that the second arg is None if the token kind is COLON.
                if current[0] == TextKind.VARIABLE:
                    advance()
                match current:
                    case (DelimiterKind.COLON, _, _):
                        match advance():
                            case (TextKind.FUNCTION, fn_name, position):
                                match fn_name:
                                    case "show" | "cond" | "plural" | "list":
                                        consume(DelimiterKind.COLON)                                                       
                                        advance()
                                        match fn_name:
                                            case "cond":
                                                result = NumericConditionPlaceholder(var_name, collect_conditional_options())
                                            case _:
                                                result = ConditionalPlaceholder(var_name, collect_options(), fn_name=fn_name)
                                    case _:
                                        # all other functions are assumed to take the name() form
                                        consume(DelimiterKind.PAREN_OPEN)
                                        match fn_name:
                                            case "choose":
                                                # this is the only name() form function that takes options
                                                keys = collect_keys()
                                                consume(DelimiterKind.COLON)
                                                advance()
                                                options = collect_options()
                                                if len(options) < len(keys) or len(options) > len(keys) + 1:
                                                    # todo: we could decide to be permissive if the game has n-1 options for n keys, but for now I'd prefer to find out if that is ever the case.
                                                    raise MessageSyntaxError(f"Expected {len(keys)} message options (for {len(keys)} 'choose' keys) but got {len(options)}: {options}.", current[2])
                                                result = ChoosePlaceholder(var_name, options, keys)
                                            case _:
                                                match fn_name:
                                                    case "energyIcons" | "starIcons":
                                                        match advance():
                                                            case (TextKind.ARGUMENT, arg, position):
                                                                try:
                                                                    n = int(arg)
                                                                except exec:
                                                                    raise MessageSyntaxError("Invalid integer argument", position) from exec
                                                                consume(DelimiterKind.PAREN_CLOSE)
                                                            case (DelimiterKind.PAREN_CLOSE, _, _):
                                                                n = None
                                                            case bad:
                                                                raise UnexpectedTokenError(bad, "an integer or ')'")
                                                        result = RepeatPlaceholder(var_name, n, fn_name=fn_name)
                                                    # the rest of these are simple name() functions
                                                    case "diff" | "inverseDiff" | "percentLess" | "percentMore" | "n" | "abs":
                                                        result = FunctionPlaceholder(var_name, fn_name=fn_name)
                                                        consume(DelimiterKind.PAREN_CLOSE)
                                                    case _:
                                                        raise MessageSyntaxError(f"Unrecognised template function {fn_name}", position)
                                                advance() #all the other placeholders have options and therefore proceed current up to a }, but these need an extra hand
                            case _:
                                result = ConditionalPlaceholder(var_name, collect_options())
                    case (DelimiterKind.BRACE_CLOSE, _, _):
                        result = Placeholder(var_name)
                    case bad:
                        raise UnexpectedTokenError(bad, "':' or '}}' after a placeholder's variable name")
            case (DelimiterKind.BRACE_CLOSE, _, _):
                result = Placeholder(None)
            case bad:
                raise UnexpectedTokenError(bad, "a variable name")
        # note: this check is redundant in the event of a simple placeholder,
        # but doing it at the outermost level is more fail-fast and reduces the risk of the rest of the code being accidentally incomplete
        match current:
            case (DelimiterKind.BRACE_CLOSE, _, _):
                advance() # skip past the } we confirmed to exist above
            case bad:
                raise UnexpectedTokenError(current, "a '}' to end the placeholder")
        return result
    try:
        result = collect_message()
        if current is not None:
            raise UnexpectedTokenError(current, "end of message")
        return result
    except MessageSyntaxError as exec:
        position = exec.position or len(message)
        raise MessageSyntaxError(
f"""Failed to parse message. A problem was found at position {position}:
{message.replace("\n", " ")}
{"-" * (max(0, position - 1))}^
"""
        ) from exec


def resolve_description(
    raw: str, vars_dict: dict[str, int | str], is_upgraded: bool = False
) -> str:
    """Companion to app.parsers.description_resolver.resolve_description (e.g. for testing)"""
    resolve_recursively(parse(raw), vars_dict, is_upgraded)


    def resolve_recursively(
        message: ParsedMessage
    ) -> Generator[str, None, None]:
        """Companion to app.parsers.description_resolver.resolve_description (e.g. for testing). Will be able to modify to yield icu after."""

        for part in message:
            match part:
                case RepeatPlaceholder(variable, n, fn_name=fn_name):
                    if fn_name.endswith("Icons"):
                        fn_name = fn_name[:fn_name.index("Icons")]
                    yield "["
                    yield fn_name
                    yield ":"
                    if n:
                        yield str(n)
                    else:
                        yield str(_lookup(variable, vars_dict))
                    yield "]"
                case ChoosePlaceholder(variable, options, keys, fn_name=fn_name):
                    match fn_name:
                        case "choose":
                            yield from resolve_recursively(options[keys.index(_lookup(variable, vars_dict))])
                        case _:
                            raise "unrecognised fn"
                case ConditionalPlaceholder(variable, options, fn_name=fn_name):
                    if variable == "IfUpgraded":
                        value = is_upgraded
                    else:
                        value = _lookup(variable, vars_dict)
                    match fn_name:
                        case None | "show" if len(options) <= 2:
                            if value:
                                yield from resolve_recursively(options[0])
                            elif len(value) == 2:
                                yield from resolve_recursively(options[1])
                        case "plural":
                            if value == 1:
                                yield from resolve_recursively(options[0])
                            else:
                                yield from resolve_recursively(options[1])
                        case "list":
                            if len(value) > 0:
                                yield from resolve_recursively(options[0])
                                i = 0
                                while i < len(value):
                                    yield from resolve_recursively(options[1])
                                    yield from resolve_recursively(options[0])
                            if len(value) == 3:
                                yield from resolve_recursively(options[2])
                        case _:
                            raise "idk how to handle this conditional conditional"
                case NumericConditionPlaceholder(variable, options, fn_name=fn_name):
                    value = _lookup(variable, vars_dict)
                    if not isinstance(value, int):
                        raise "wrong type"
                    for option in options:
                        match option.condition:
                            case None:
                                hit = True
                            case (op, threshold):
                                match op:
                                    case ComparisonOperator.GREATER_THAN if value > threshold:
                                        hit = True
                                    case ComparisonOperator.GREATER_THAN_OR_EQUAL if value >= threshold:
                                        hit = True
                                    case ComparisonOperator.LESS_THAN if value < threshold:
                                        hit = True
                                    case ComparisonOperator.LESS_THAN_OR_EQUAL if value <= threshold:
                                        hit = True
                                    case ComparisonOperator.EQUAL if value == threshold:
                                        hit = True
                                    case ComparisonOperator.NOT_EQUAL if value != threshold:
                                        hit = True
                                    case _:
                                        hit = False
                        if hit:
                            yield from option
                            break
                case FunctionPlaceholder(variable, fn_name=fn_name):
                    value = _lookup(variable, vars_dict)
                    if value is None:
                        raise "couldn't find the val"
                    match fn_name:
                        case "percentMore" if isinstance(val, (int, float)):
                            yield str(int((val - 1) * 100))
                        case "percentLess" if isinstance(val, (int, float)):
                            yield str(int((1 - val) * 100))
                        case "diff":
                            yield value
                        case "inverseDiff":
                            yield value
                        case _:
                            raise "unrecognised fn"
                case Placeholder(variable) if variable == "singleStarIcon":
                    yield from resolve_recursively(RepeatPlaceholder(variable, 1, fn_name="starIcons"))
                case Placeholder(variable):
                    value = _lookup(variable, vars_dict)
                    if value is None:
                        raise "couldn't find the val"
                    else:
                        yield value
                case x if isinstance(x, str):
                    yield x
                case _:
                    raise "unrecognised message part"

    # # Handle remaining {Var} without formatter
    # def _make_readable(name: str) -> str:
    #     # Strip trailing digits (e.g. Enchantment1 -> Enchantment) but keep
    #     # CamelCase intact so [OwnerName] stays a single token for the
    #     # frontend tokenizer (spaces would break it into a false BBCode tag).
    #     readable = re.sub(r"\d+$", "", name).strip()
    #     return readable

    # def resolve_bare(m):
    #     value = _lookup(m.group(1), vars_dict)
    #     if val is not None:
    #         return str(val)
    #     return f"[{_make_readable(m.group(1))}]"

    # text = re.sub(r"\{(\w+)\}", resolve_bare, text)

    # # Handle {Var:cond:...} and other complex formatters -> just show value
    # def resolve_remaining(m):
    #     var_name = m.group(1).split(":")[0]
    #     value = _lookup(var_name, vars_dict)
    #     if val is not None:
    #         return str(val)
    #     return f"[{_make_readable(var_name)}]"

    # text = re.sub(r"\{([^}]+)\}", resolve_remaining, text)

    return text

# todo: write a helper for converting to ICU

def unparse(parsed: ParsedMessage) -> str:
    """
    A helper that compiles a ParsedMessage back into the game's original syntax.
    Mainly useful for testing/validating the implementation of parse_message(str).

    Note: Theoretically, currently, it should be able to reproduce inputs exactly.
    SmartFormat is more permissive than that would allow but the game might not actually leverage that permissiveness.
    Even if that does occur in future the parser 
    """
    return ''.join(unparse_recursively(parsed))

# Note: the rest of this file is deceptively simple for how long it is and is internal helpers for the above

def unparse_recursively(parsed: ParsedMessage) -> Generator[str, None, None]:
    """
    The generator form is genuinely more efficient for recursion
    """
    def inject_bars(content: Generator[str, None, None]):
        each = next(content, None)
        while each is not None:
            yield from each
            each = next(content, None)
            if each is not None:
                yield "|"
    for part in parsed:
        match part:
            case RepeatPlaceholder(variable, n, fn_name=fn_name):
                yield "{"
                if variable:
                    yield variable
                yield ":"
                yield fn_name
                yield "("
                yield "" if n is None else str(n)
                yield ")}"
            case ChoosePlaceholder(variable, options, keys, fn_name=fn_name):
                yield "{"
                if variable:
                    yield variable
                yield ":"
                yield fn_name
                yield "("
                yield from inject_bars(keys.__iter__())
                yield ")"
                yield ":"
                yield from inject_bars(map(unparse_recursively, options))
                yield "}"
            case NumericConditionPlaceholder(variable, options, fn_name=fn_name):
                yield "{"
                if variable:
                    yield variable
                yield ":"
                yield fn_name
                yield ":"
                yield from inject_bars(map(unparse_conditional_message_recursively, options))
                yield "}"
            case ConditionalPlaceholder(variable, options, fn_name=fn_name):
                yield "{"
                if variable:
                    yield variable
                yield ":"
                if fn_name:
                    yield fn_name
                    yield ":"
                yield from inject_bars(map(unparse_recursively, options))
                yield "}"
            case FunctionPlaceholder(variable, fn_name=fn_name):
                yield "{"
                if variable:
                    yield variable
                yield ":"
                yield fn_name
                yield "()}"
            case Placeholder(variable):
                yield "{"
                if variable:
                    yield variable
                yield "}"
            case text if isinstance(text, str):
                yield text
            case bad:
                raise ValueError(f"Unrecognised message part: {bad}")
def unparse_conditional_message_recursively(message: ConditionalMessage) -> Generator[str, None, None]:
    if message.condition is not None:
        yield message.condition.operator.value
        yield str(message.condition.threshold)
        yield "?"
    yield from unparse_recursively(message.content)