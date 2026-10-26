"""Day 8, exercise 2: tests for good_job.py, in the style of the official
"Testing PySpark" guide (option 3, pytest).

Reference solution. Run next to good_job.py and lab_utils.py: pytest -q
"""
import pytest
from pyspark.sql import SparkSession
from pyspark.testing import assertDataFrameEqual

from good_job import add_flags, build_report, clean_status


@pytest.fixture(scope="session")
def spark():
    session = SparkSession.builder.master("local[2]").appName("good-job-tests").getOrCreate()
    yield session
    session.stop()


def test_clean_status_trims_uppercases_and_fills_nulls(spark):
    df = spark.createDataFrame([(" paid ",), ("new",), (None,)], "status string")
    expected = spark.createDataFrame([("PAID",), ("NEW",), ("UNKNOWN",)], "status string")
    assertDataFrameEqual(clean_status(df), expected)


def test_add_flags_appends_literal_columns(spark):
    df = spark.createDataFrame([(1,)], "id long")
    assert add_flags(df, 3).columns == ["id", "flag_0", "flag_1", "flag_2"]


def test_build_report_keeps_only_big_orders_from_vip_countries(spark):
    orders = spark.createDataFrame(
        [(1, 10, 50.0, "paid"), (2, 10, 5.0, "paid"), (3, 20, 70.0, " new ")],
        "order_id long, customer_id long, amount double, status string",
    )
    customers = spark.createDataFrame([(10, "C1"), (20, "C9")], "customer_id long, country string")
    report = build_report(orders, customers, min_amount=20.0, vip_countries=["C1"], flags=0)
    expected = spark.createDataFrame(
        [(10, 1, 50.0, "PAID", "C1")],
        "customer_id long, order_id long, amount double, status string, country string",
    )
    assertDataFrameEqual(report, expected)
