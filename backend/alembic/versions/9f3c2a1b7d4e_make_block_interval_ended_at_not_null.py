"""make block_interval.ended_at not null

Revision ID: 9f3c2a1b7d4e
Revises: 2306d4340d39
Create Date: 2026-09-11

No real users yet, so no legacy open rows to preserve: drop any NULL
interval (and blocks left without intervals) then enforce NOT NULL. A
stored block is always closed (invariants 2 and 3).
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9f3c2a1b7d4e'
down_revision: str | Sequence[str] | None = '2306d4340d39'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # No legacy compat: NULL ends predate the closed-interval contract and
    # have no meaning to preserve before launch.
    op.execute(sa.text("DELETE FROM block_interval WHERE ended_at IS NULL"))
    op.execute(
        sa.text(
            "DELETE FROM block WHERE NOT EXISTS "
            "(SELECT 1 FROM block_interval WHERE block_interval.block_id = block.id)"
        )
    )
    op.alter_column(
        "block_interval", "ended_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "block_interval", "ended_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )
