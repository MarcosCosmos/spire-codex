
import json
import os
import warnings

from app.parsers.parser_paths import loc_dir as _loc_dir, data_dir as _data_dir
from app.parsers.message_parser import lex, parse, unparse, resolve_description as new_resolver
from app.parsers.description_resolver import resolve_description as old_resolver
# note: this main method does testing the entry 
def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    filenames = filter(lambda x: x.endswith(".json"), os.listdir(loc_dir))
    successful = []
    failed = []
    for name in filenames:
        with open(loc_dir / name, "r", encoding="utf8") as f:
            messages_json: dict[str] = json.load(f)
        for key, message in messages_json.items():
            full_key = f"{name}.{key}"
            parsed = parse(message)
            unparsed = unparse(parsed)
            if unparsed == message:
                old_resolved = old_resolver(message)
                new_resolved = new_resolver(message)
                if new_resolved == old_resolved:
                    successful.append(message)
                    continue    
            failed.append(full_key)
            warnings.warn(
f"""Warning: unparse did not reproduce the original message for key: {name}.{key}. This may or may not be an error:
Original:
{message.replace("\n", " ")}
Unparsed:
{unparsed.replace("\n", " ")}
Parsed intermediate (for reference):
{parsed}
""")
    print(f"Successfully parsed and accurately unparsed {len(successful)}/{len(successful)+len(failed)} messages")
    

if __name__ == "__main__":
    main()
