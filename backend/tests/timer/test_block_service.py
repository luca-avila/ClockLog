# Tempo — a Pomodoro timer and weekly planner
# Copyright (C) 2024  Luca
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.user.models import User
from app.shared.user.schemas import UserCreate
from app.shared.user.service import create_user
from app.timer.models import Block, BlockInterval
from app.timer.schemas import BlockCreate, BlockUpdate
from app.timer.service import compute_duration, create_block, get_block_by_id


def make_utc(*, hour=12, minute=0) -> datetime:
    return datetime(2026, 8, 5, hour, minute, tzinfo=UTC)


class TestBlockModel:
    async def test_rejects_naive_datetime_in_schema(self):
        """BlockCreate.started_at / ended_at must be timezone-aware UTC."""
        naive = datetime(2026, 8, 5, 12, 0)
        with pytest.raises(ValueError):
            BlockCreate(
                id=uuid.uuid4(),
                started_at=naive,
                ended_at=naive,
                status="completed",
            )

    def test_no_duration_column(self):
        """Duration is derived, never stored (invariant 6)."""
        columns = {c.name for c in Block.__table__.columns}
        assert "duration" not in columns
        assert "duration_seconds" not in columns
        assert "elapsed_ms" not in columns

    def test_index_blocks_user_id_started_at_exists(self):
        """Index blocks(user_id, started_at) exists (invariant)."""
        indexes = {idx.name for idx in Block.__table__.indexes}
        # SQLAlchemy auto-names: ix_tablename_column
        assert any("user_id" in idx and "started_at" in idx for idx in indexes)

    async def test_block_stores_status_enum(self, db_session):
        """Block.status is an enum with 'completed' and 'aborted'."""
        block = Block(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            status="completed",
            label="test",
            started_at=make_utc(),
        )
        assert block.status == "completed"
        block.status = "aborted"
        assert block.status == "aborted"


class TestBlockIntervals:
    async def test_intervals_sum_correctly(self, db_session: AsyncSession):
        user = await _create_test_user(db_session)
        block_id = uuid.uuid4()

        block = Block(
            id=block_id,
            user_id=user.id,
            status="completed",
            started_at=make_utc(hour=9),
            intervals=[
                BlockInterval(
                    id=uuid.uuid4(),
                    started_at=make_utc(hour=9),
                    ended_at=make_utc(hour=9, minute=15),
                ),
                BlockInterval(
                    id=uuid.uuid4(),
                    started_at=make_utc(hour=9, minute=17),
                    ended_at=make_utc(hour=9, minute=27),
                ),
            ],
        )

        total = compute_duration(block)
        # 15 min + 10 min = 25 min
        assert total == timedelta(minutes=25)

    async def test_paused_time_is_excluded(self, db_session: AsyncSession):
        """Pause gap between intervals is not counted."""
        user = await _create_test_user(db_session)
        block_id = uuid.uuid4()

        block = Block(
            id=block_id,
            user_id=user.id,
            status="completed",
            started_at=make_utc(hour=9),
            intervals=[
                BlockInterval(
                    id=uuid.uuid4(),
                    started_at=make_utc(hour=9),
                    ended_at=make_utc(hour=9, minute=5),
                ),
                # 10 minute pause gap (not an interval, so not counted)
                BlockInterval(
                    id=uuid.uuid4(),
                    started_at=make_utc(hour=9, minute=15),
                    ended_at=make_utc(hour=9, minute=20),
                ),
            ],
        )

        total = compute_duration(block)
        # 5 min + 5 min = 10 min (not 20 min)
        assert total == timedelta(minutes=10)

    async def test_three_intervals_report_right_total(self, db_session):
        user = await _create_test_user(db_session)
        block_id = uuid.uuid4()

        block = Block(
            id=block_id,
            user_id=user.id,
            status="completed",
            started_at=make_utc(hour=9),
            intervals=[
                BlockInterval(
                    id=uuid.uuid4(),
                    started_at=make_utc(hour=9),
                    ended_at=make_utc(hour=9, minute=10),
                ),
                BlockInterval(
                    id=uuid.uuid4(),
                    started_at=make_utc(hour=9, minute=12),
                    ended_at=make_utc(hour=9, minute=15),
                ),
                BlockInterval(
                    id=uuid.uuid4(),
                    started_at=make_utc(hour=9, minute=20),
                    ended_at=make_utc(hour=9, minute=25),
                ),
            ],
        )

        total = compute_duration(block)
        # 10 + 3 + 5 = 18 min
        assert total == timedelta(minutes=18)


class TestService:
    async def test_create_and_read_block(self, db_session: AsyncSession):
        user = await _create_test_user(db_session)
        block_id = uuid.uuid4()

        data = BlockCreate(
            id=block_id,
            started_at=make_utc(hour=9),
            ended_at=make_utc(hour=9, minute=25),
            status="completed",
            label="debug JWT refresh",
            tag_id=None,
        )
        await create_block(db_session, data, user.id)
        await db_session.commit()

        retrieved = await get_block_by_id(db_session, block_id, user.id)
        assert retrieved is not None
        assert retrieved.label == "debug JWT refresh"
        assert retrieved.status == "completed"
        # had one interval (from started_at to ended_at)
        assert len(retrieved.intervals) == 1

    async def test_same_client_uuid_is_idempotent(self, db_session: AsyncSession):
        user = await _create_test_user(db_session)
        block_id = uuid.uuid4()

        data = BlockCreate(
            id=block_id,
            started_at=make_utc(hour=9),
            ended_at=make_utc(hour=9, minute=25),
            status="completed",
            label="test idempotent",
            tag_id=None,
        )
        block1 = await create_block(db_session, data, user.id)
        await db_session.commit()

        # Post same block again
        block2 = await create_block(db_session, data, user.id)

        assert block1.id == block2.id
        # Verify only one row in DB
        result = await db_session.execute(
            select(Block).where(Block.id == block_id, Block.user_id == user.id)
        )
        rows = result.scalars().all()
        assert len(rows) == 1

    async def test_aborted_block_keeps_real_elapsed_time(self, db_session):
        user = await _create_test_user(db_session)
        block_id = uuid.uuid4()

        data = BlockCreate(
            id=block_id,
            started_at=make_utc(hour=9),
            ended_at=make_utc(hour=9, minute=12),  # aborted after 12 min
            status="aborted",
            label="client email",
            tag_id=None,
        )
        block = await create_block(db_session, data, user.id)
        await db_session.commit()

        assert block.status == "aborted"
        duration = compute_duration(block)
        assert duration == timedelta(minutes=12)


class TestUpdateBlock:
    async def test_start_edit_moves_block_across_day_boundary(self, db_session):
        """Block.started_at must follow an interval start edit — it is what
        history filters and day-buckets run on (invariant 7)."""
        from datetime import date

        from app.timer.service import update_block

        user = await _create_test_user(db_session)
        data = BlockCreate(
            id=uuid.uuid4(),
            started_at=datetime(2026, 8, 5, 23, 50, tzinfo=UTC),
            ended_at=datetime(2026, 8, 6, 0, 10, tzinfo=UTC),
            status="completed",
            label="late block",
            tag_id=None,
        )
        block = await create_block(db_session, data, user.id)
        await db_session.commit()

        # Belongs to the day it started (Aug 5), not the day it ended.
        assert block.started_at.date() == date(2026, 8, 5)

        # Edit the start into the next day: both columns must move.
        await update_block(
            db_session,
            block.id,
            user.id,
            BlockUpdate(started_at=datetime(2026, 8, 6, 0, 10, tzinfo=UTC)),
        )
        await db_session.commit()

        moved = await get_block_by_id(db_session, block.id, user.id)
        assert moved is not None
        assert moved.started_at.date() == date(2026, 8, 6)
        assert moved.intervals[0].started_at == moved.started_at


async def _create_test_user(db_session: AsyncSession) -> User:
    email = f"test-{uuid.uuid4()}@example.com"
    user = await create_user(db_session, UserCreate(email=email, password="secret12"))
    await db_session.commit()
    return user
