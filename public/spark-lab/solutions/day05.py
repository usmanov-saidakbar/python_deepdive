"""Day 5 exercises: every join type, and the join-strategy matrix.

Reference solution. Needs data/orders and data/customers from the Day 2 lab.
Run it next to lab_utils.py: python day05.py
"""
from pyspark.sql import Row

from lab_utils import F, count_nodes, get_spark, make_orders, plan_text

spark = get_spark("day05", delta=False, avro=False)

# --- Exercise 1: every join type on the chapter's data ---------------------
df1 = spark.createDataFrame([
    Row(age=10, height=80.0, name="alice"),
    Row(age=9, height=78.9, name="josh"),
    Row(age=18, height=82.3, name="bush"),
    Row(age=7, height=75.3, name="tom"),
])
df2 = spark.createDataFrame([
    Row(incomes=[123.0, 456.0, 789.0], name="alice"),
    Row(incomes=[234.0, 567.0], name="bob"),
    Row(incomes=[79.0, 128.0], name="josh"),
    Row(incomes=[123.0, 145.0, 178.0], name="bush"),
    Row(incomes=[111.0, 187.0, 451.0, 188.0, 199.0], name="jerry"),
])

spark.conf.set("spark.sql.adaptive.enabled", "false")

# DataFrames built from Python rows have no size estimate (sizeInBytes is
# Long.MaxValue), so Spark never broadcasts them on its own.
print("df2 size estimate:", df2._jdf.queryExecution().optimizedPlan().stats().sizeInBytes())


def strategy_of(df):
    text = plan_text(df, "simple")
    name = next(s for s in ["BroadcastHashJoin", "SortMergeJoin", "ShuffledHashJoin"] if s in text)
    return name + (" BuildRight" if "BuildRight" in text else " BuildLeft" if "BuildLeft" in text else "")


predicted = {"inner": 3, "left": 4, "right": 5, "full": 6, "left_semi": 3, "left_anti": 1}
# Which hint each join type can honour: the side whose rows must all be kept
# cannot be the broadcast (build) side.
honours = {
    "inner": ("BroadcastHashJoin BuildRight", "BroadcastHashJoin BuildLeft"),
    "left": ("BroadcastHashJoin BuildRight", "SortMergeJoin"),
    "right": ("SortMergeJoin", "BroadcastHashJoin BuildLeft"),
    "full": ("SortMergeJoin", "SortMergeJoin"),
    "left_semi": ("BroadcastHashJoin BuildRight", "SortMergeJoin"),
    "left_anti": ("BroadcastHashJoin BuildRight", "SortMergeJoin"),
}
for how, rows in predicted.items():
    joined = df1.join(df2, on="name", how=how)
    hint_right = strategy_of(df1.join(F.broadcast(df2), on="name", how=how))
    hint_left = strategy_of(F.broadcast(df1).join(df2, on="name", how=how))
    print(f"{how:10} rows={joined.count()}  no hint: {strategy_of(joined):14} "
          f"broadcast(df2): {hint_right:29} broadcast(df1): {hint_left}")
    assert joined.count() == rows, how
    assert (hint_right, hint_left) == honours[how], how
cross = df1.crossJoin(df2)
print("cross      rows=%d" % cross.count())
assert cross.count() == 20

# --- Exercise 2: predict, then verify the strategy matrix -------------------
orders = spark.read.parquet("data/orders")
cust = spark.read.parquet("data/customers")
big2 = make_orders(spark, 1_000_000, seed=1)
JOINS = ["BroadcastHashJoin", "ShuffledHashJoin", "SortMergeJoin", "BroadcastNestedLoopJoin", "CartesianProduct"]


def strategy(df):
    counts = count_nodes(df, *JOINS, "Exchange")
    return [j for j in JOINS if counts[j]][0], counts["Exchange"]


cases = {
    "a inner, small right": (lambda: orders.join(cust, "customer_id"), "BroadcastHashJoin"),
    "b two large tables": (lambda: orders.join(big2, "customer_id"), "SortMergeJoin"),
    "c small LEFT side, left join": (lambda: cust.join(orders, "customer_id", "left"), "SortMergeJoin"),
    "d full outer": (lambda: orders.join(cust, "customer_id", "full"), "SortMergeJoin"),
    "e non-equi": (lambda: orders.join(cust, orders.amount < cust.customer_id), "BroadcastNestedLoopJoin"),
}
for name, (build, expected) in cases.items():
    got = strategy(build())
    print(f"{name:30} {got}")
    assert got[0] == expected, name

spark.conf.set("spark.sql.autoBroadcastJoinThreshold", -1)
got = strategy(orders.join(cust, orders.amount < cust.customer_id))
print(f"{'f non-equi, broadcast off':30} {got}")
assert got[0] == "CartesianProduct"

spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "1MB")
spark.conf.set("spark.sql.join.preferSortMergeJoin", "false")
got = strategy(orders.join(make_orders(spark, 200_000, seed=2), "customer_id"))
print(f"{'g preferSortMergeJoin=false':30} {got}")
assert got[0] == "ShuffledHashJoin"
print("day05: all checks passed")
