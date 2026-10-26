"""Day 8, exercise 1: bad_job.py refactored.

Reference solution. Every fix from the Day 8 checklist, with the logic in small
functions so it can be tested (see test_good_job.py).
Usage, next to lab_utils.py: python good_job.py --config good_job.json
"""
import argparse
import json
import time

from pyspark.sql import DataFrame

from lab_utils import F, get_spark


def clean_status(df: DataFrame) -> DataFrame:
    """Built-in functions instead of a Python UDF: trimmed, upper-case, never null."""
    return df.withColumn("status", F.coalesce(F.upper(F.trim("status")), F.lit("UNKNOWN")))


def add_flags(df: DataFrame, n: int) -> DataFrame:
    """One select with a list of expressions instead of n withColumn calls."""
    return df.select("*", *[F.lit(i).alias(f"flag_{i}") for i in range(n)])


def build_report(orders: DataFrame, customers: DataFrame, min_amount: float,
                 vip_countries: list, flags: int = 40) -> DataFrame:
    big = orders.filter(F.col("amount") > min_amount)               # filter early, pushed down
    vip = customers.filter(F.col("country").isin(vip_countries))
    joined = big.join(F.broadcast(vip), "customer_id")              # small dimension: broadcast
    return add_flags(clean_status(joined), flags)


def main():
    parser = argparse.ArgumentParser(description="Big orders from VIP countries")
    parser.add_argument("--config", default="good_job.json")
    args = parser.parse_args()
    with open(args.config) as f:
        config = json.load(f)                                        # no hardcoded values

    spark = get_spark("good-job", delta=False, avro=False)
    start = time.perf_counter()
    report = build_report(
        spark.read.parquet(config["orders_path"]),
        spark.read.parquet(config["customers_path"]),
        config["min_amount"],
        config["vip_countries"],
    )
    report.write.mode("overwrite").parquet(config["output_path"])   # parallel write, no coalesce(1)
    print(f"good job finished in {time.perf_counter() - start:.1f}s")


if __name__ == "__main__":
    main()
