from database import SessionLocal
from runtime import ensure_runtime_schema, logger


def main() -> None:
    with SessionLocal() as db:
        ensure_runtime_schema(db, include_vote_constraints=True)
    logger.info("Database bootstrap completed successfully")


if __name__ == "__main__":
    main()
