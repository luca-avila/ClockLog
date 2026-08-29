"""add email verification and reset tokens

Revision ID: 2306d4340d39
Revises: 31c17e2aabb2
Create Date: 2026-08-29 00:35:58.030295

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2306d4340d39'
down_revision: Union[str, Sequence[str], None] = '31c17e2aabb2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('email_token',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('purpose', sa.String(length=16), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_email_token_token_hash'), 'email_token', ['token_hash'], unique=True)
    op.create_index(op.f('ix_email_token_user_id'), 'email_token', ['user_id'], unique=False)
    op.add_column('user', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    # server_default backs the NOT NULL on existing rows; it stays afterwards —
    # harmless and simpler than a drop.
    op.add_column('user', sa.Column('password_changed_at', sa.DateTime(timezone=True),
                                    nullable=False, server_default=sa.func.now()))
    # Backfill autogenerate cannot write: without it the existing account is
    # left unverified and every login 403s looking like a code bug.
    op.execute('UPDATE "user" SET email_verified_at = created_at WHERE email_verified_at IS NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('user', 'password_changed_at')
    op.drop_column('user', 'email_verified_at')
    op.drop_index(op.f('ix_email_token_user_id'), table_name='email_token')
    op.drop_index(op.f('ix_email_token_token_hash'), table_name='email_token')
    op.drop_table('email_token')
