from datetime import datetime, timezone, timedelta

BJT = timezone(timedelta(hours=8))


def now_beijing() -> str:
    return datetime.now(BJT).strftime("%Y-%m-%d %H:%M:%S")


def today_beijing() -> str:
    return datetime.now(BJT).strftime("%Y-%m-%d")
