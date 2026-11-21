"""Export the supplied workbook's item-day history and KNIME input."""

import argparse
import csv
import json
from pathlib import Path
from tempfile import NamedTemporaryFile

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
WEEK = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
CATEGORIES = ("Appetizer", "Entree", "Drinks", "Dessert", "Sides")
COLUMNS = (
    "Item_ID", "Category", "Dish_Name", "Main_Ingredient", "Unit_Price",
    "Day", "Day_of_Week", "Units_Sold", "Total_Revenue",
)


def read_workbook(path):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        catalog = {}
        for row in workbook["Menu Catalog"].iter_rows(min_row=2, max_col=5, values_only=True):
            item, category, dish, ingredient, price = row
            if all(value is None for value in row):
                continue
            if not all(isinstance(value, str) and value.strip() for value in row[:4]):
                raise ValueError(f"Incomplete catalog row: {row}")
            if item in catalog or category not in CATEGORIES or not (0 < float(price) < float("inf")):
                raise ValueError(f"Invalid catalog item: {item}")
            catalog[item] = dict(id=item, category=category, name=dish, ingredient=ingredient, price=float(price))

        history = []
        positions = set()
        rows = workbook["KNIME_Ready_Long_Format"].iter_rows(max_col=len(COLUMNS), values_only=True)
        if next(rows) != COLUMNS:
            raise ValueError("Unexpected KNIME_Ready_Long_Format header.")
        for row in rows:
            if all(value is None for value in row):
                continue
            item, category, dish, ingredient, price, day, weekday, units, revenue = row
            expected = catalog.get(item)
            if not expected or (category, dish, ingredient, price) != (
                expected["category"], expected["name"], expected["ingredient"], expected["price"]
            ):
                raise ValueError(f"History disagrees with the catalog for {item}.")
            if (
                day != int(day) or not 1 <= day <= 60 or (item, day) in positions
                or weekday != WEEK[(int(day) - 1) % len(WEEK)] or units != int(units)
                or units < 0 or abs(revenue - units * price) > 0.005
            ):
                raise ValueError(f"Invalid sales row for {item}, day {day}.")
            positions.add((item, day))
            history.append((item, category, dish, ingredient, price, int(day), weekday, int(units), revenue))
        if not catalog or len(history) != len(catalog) * 60:
            raise ValueError("Each catalog item must have one row for every day from 1 through 60.")
        return list(catalog.values()), sorted(history, key=lambda row: (row[0], row[5]))
    finally:
        workbook.close()


def write_file(path, write):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", newline="", dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            write(stream)
            stream.close()
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def write_csv(path, rows):
    def emit(stream):
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(COLUMNS)
        writer.writerows(rows)
    write_file(path, emit)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "forecasting" / "Restaurant Forecast" / "data")
    parser.add_argument("--catalog", type=Path, default=ROOT / "src" / "domain" / "restaurant-catalog.json")
    args = parser.parse_args()
    catalog, history = read_workbook(args.workbook)
    future = [
        (dish["id"], dish["category"], dish["name"], dish["ingredient"], dish["price"],
         day, WEEK[(day - 1) % len(WEEK)], "", "")
        for dish in catalog for day in range(61, 68)
    ]
    write_csv(args.output / "sales-history.csv", history)
    write_csv(args.output / "forecast-input.csv", history + future)
    write_file(args.catalog, lambda stream: stream.write(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"))
    print(f"Exported {len(history)} historical rows and {len(future)} forecast inputs for {len(catalog)} dishes.")


if __name__ == "__main__":
    main()
