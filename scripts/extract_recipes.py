import glob
import json
import os
import re
from collections import defaultdict

import xlrd


SOURCE_DIR = r"C:\Users\Viktor\Downloads\1.8.2025 Piatok Jedáleň"
OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "recipes.json")
OUTPUT_JS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "recipes.js")


def clean(value):
    if value is None:
        return ""
    text = str(value).replace("\xa0", " ").strip()
    text = re.sub(r"\s+", " ", text)
    if text.endswith(".0"):
        text = text[:-2]
    return text


def number(value):
    if isinstance(value, (int, float)) and value != "":
        return float(value)
    if isinstance(value, str):
        value = value.replace(",", ".").strip()
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def file_meta(path):
    name = os.path.splitext(os.path.basename(path))[0]
    source = "MESTO" if "MESTO" in name.upper() else "Jedáleň"
    date_match = re.match(r"(\d{1,2}\.\d{1,2}\.\d{4})\s+(.+?)\s+(Jedáleň|MESTO)$", name, re.I)
    if not date_match:
        return {"file": os.path.basename(path), "source": source, "date": "", "day": ""}
    return {
        "file": os.path.basename(path),
        "source": source,
        "date": date_match.group(1),
        "day": date_match.group(2),
    }


def find_recipe_groups(sheet):
    starts = []
    for col in range(1, min(sheet.ncols, 12)):
        title = clean(sheet.cell_value(0, col))
        portions = number(sheet.cell_value(2, col)) if sheet.nrows > 2 else 0
        if title and portions:
            starts.append(col)

    groups = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else min(sheet.ncols, 12)
        title_parts = [clean(sheet.cell_value(0, start))]
        second_line = clean(sheet.cell_value(1, start)) if sheet.nrows > 1 else ""
        if second_line:
            title_parts.append(second_line)
        codes = []
        for code_col in range(start, end):
            code = clean(sheet.cell_value(3, code_col)) if sheet.nrows > 3 else ""
            if re.search(r"\d+\s*s\b", code, re.I):
                codes.append(code)

        groups.append(
            {
                "start": start,
                "end": end,
                "name": clean(" ".join(title_parts)),
                "base_portions": number(sheet.cell_value(2, start)),
                "recipe_code": ", ".join(codes),
                "netto": clean(sheet.cell_value(4, start)) if sheet.nrows > 4 else "",
            }
        )
    return groups


def infer_unit(name, order_value):
    text = f"{name} {order_value}".lower()
    if "ks" in text or "vajce" in text or "chlieb" in text:
        return "ks"
    return "kg"


def extract_file(path):
    workbook = xlrd.open_workbook(path, formatting_info=True)
    sheet = workbook.sheet_by_index(0)
    meta = file_meta(path)
    groups = find_recipe_groups(sheet)
    recipes = []

    for group in groups:
        ingredients = []
        for row in range(5, sheet.nrows):
            ingredient = clean(sheet.cell_value(row, 0))
            if not ingredient:
                continue

            amount = 0.0
            for col in range(group["start"], group["end"]):
                amount += number(sheet.cell_value(row, col))

            if amount <= 0:
                continue

            order_value = clean(sheet.cell_value(row, 13)) if sheet.ncols > 13 else ""
            ingredients.append(
                {
                    "name": ingredient,
                    "amount": round(amount, 6),
                    "perPerson": round(amount / group["base_portions"], 8),
                    "unit": infer_unit(ingredient, order_value),
                }
            )

        if ingredients:
            recipes.append(
                {
                    "id": re.sub(r"[^a-z0-9]+", "-", f"{meta['file']}-{group['name']}".lower()).strip("-"),
                    "name": group["name"],
                    "basePortions": int(group["base_portions"]),
                    "recipeCode": group["recipe_code"],
                    "netto": group["netto"],
                    "source": meta,
                    "ingredients": ingredients,
                }
            )

    return recipes


def merge_duplicate_recipes(recipes):
    by_name = defaultdict(list)
    for recipe in recipes:
        by_name[recipe["name"].casefold()].append(recipe)

    merged = []
    for entries in by_name.values():
        entries.sort(key=lambda item: (item["source"]["date"], item["source"]["source"], item["source"]["file"]))
        first = entries[0]
        first["variants"] = [
            {
                "file": entry["source"]["file"],
                "source": entry["source"]["source"],
                "date": entry["source"]["date"],
                "day": entry["source"]["day"],
                "basePortions": entry["basePortions"],
            }
            for entry in entries
        ]
        merged.append(first)

    merged.sort(key=lambda item: item["name"].casefold())
    return merged


def main():
    paths = sorted(glob.glob(os.path.join(SOURCE_DIR, "*.xls")))
    all_recipes = []
    for path in paths:
        all_recipes.extend(extract_file(path))

    payload = {
        "sourceDir": SOURCE_DIR,
        "fileCount": len(paths),
        "recipeCountRaw": len(all_recipes),
        "recipes": merge_duplicate_recipes(all_recipes),
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    with open(OUTPUT_JS_PATH, "w", encoding="utf-8") as handle:
        handle.write("window.RECIPE_DATA = ")
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write(";\n")
    print(f"Wrote {OUTPUT_PATH}")
    print(f"Wrote {OUTPUT_JS_PATH}")
    print(f"Files: {payload['fileCount']}, recipes: {len(payload['recipes'])} unique / {payload['recipeCountRaw']} raw")


if __name__ == "__main__":
    main()
