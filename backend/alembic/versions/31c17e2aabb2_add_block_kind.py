"""add block kind

Revision ID: 31c17e2aabb2
Revises: c09ffda7809d
Create Date: 2026-08-16 21:36:51.178621

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "31c17e2aabb2"
down_revision: str | Sequence[str] | None = "c09ffda7809d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Postgres enums must exist before a column can use them; autogenerate
    # does not emit the CREATE TYPE itself.
    block_kind = sa.Enum("focus", "short_break", "long_break", name="block_kind")
    block_kind.create(op.get_bind(), checkfirst=True)
    op.add_column("block", sa.Column("kind", block_kind, server_default="focus", nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("block", "kind")
    sa.Enum(name="block_kind").drop(op.get_bind(), checkfirst=True)
