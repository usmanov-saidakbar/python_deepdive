"""Day 1, exercise 1: Quickstart patterns on your own data.

Reference solution. Try the exercise yourself first, then compare.
Run it next to lab_utils.py: python day01.py
"""
from datetime import date

import pandas as pd
from pyspark.sql import Row
from pyspark.testing import assertDataFrameEqual

from lab_utils import F, get_spark

spark = get_spark("day01", delta=False, avro=False)

# 1. A DataFrame from Rows with an explicit DDL schema string.
staff = spark.createDataFrame(
    [
        Row("Ann", "data", 5200.0, date(2019, 3, 1)),
        Row("Bob", "data", 4800.0, date(2021, 6, 15)),
        Row("Cid", "web", 3900.0, date(2022, 1, 10)),
        Row("Dee", "web", 4100.0, date(2020, 9, 1)),
        Row("Eve", "ops", 3500.0, date(2023, 2, 20)),
        Row("Fay", "ops", 3700.0, date(2018, 11, 5)),
    ],
    schema="name string, dept string, salary double, hired date",
)
staff.printSchema()

# 2. A derived column and a filter (both lazy: no job yet).
recent = staff.withColumn("salary_k", staff.salary / 1000).filter(staff.hired > date(2020, 1, 1))
recent.show()

# 3. Average salary per department with the DataFrame API.
api_result = staff.groupby("dept").avg("salary")

# 4. The same question in SQL over a temp view.
staff.createOrReplaceTempView("staff")
sql_result = spark.sql("SELECT dept, avg(salary) FROM staff GROUP BY dept")

# Same columns, same rows (row order is ignored by default).
assertDataFrameEqual(api_result, sql_result)
api_result.orderBy("dept").show()


# 5. Center salaries per department with applyInPandas. The function returns a
#    float column, so the output schema must say double: Spark 4 refuses to
#    truncate floats into a long column (convertToArrowArraySafely=true).
def minus_dept_mean(pdf: pd.DataFrame) -> pd.DataFrame:
    return pdf.assign(salary=pdf.salary - pdf.salary.mean())


centered = staff.groupby("dept").applyInPandas(
    minus_dept_mean, schema="name string, dept string, salary double, hired date"
)
centered.orderBy("dept", "name").show()

# Every department's centered salaries sum to zero.
sums = centered.groupBy("dept").agg(F.round(F.sum("salary"), 6).alias("s")).collect()
assert all(r.s == 0 for r in sums), sums
print("day01: all checks passed")
