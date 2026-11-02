"""Track club membership declines and notification idempotency.

Revision ID: 41b7c6d2a903
Revises: 7c42a1e9d6b3
Create Date: 2026-11-01
"""
from alembic import op
import sqlalchemy as sa


revision = "41b7c6d2a903"
down_revision = "7c42a1e9d6b3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("club_membership", sa.Column("declined_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("club_membership", sa.Column("decline_reason", sa.String(length=250), nullable=True))
    op.add_column("notification", sa.Column("target_url", sa.String(length=300), nullable=True))
    op.add_column("notification", sa.Column("idempotency_key", sa.String(length=220), nullable=True))
    op.create_index("uq_notification_idempotency_key", "notification", ["idempotency_key"], unique=True)

    # Before this migration, a single unique membership row represented the latest
    # state. Each existing rejected row therefore records one known decline.
    op.execute("UPDATE club_membership SET declined_count = 1 WHERE status IN ('rejected', 'declined')")
    op.execute("UPDATE club_membership SET status = 'declined' WHERE status = 'rejected'")


def downgrade():
    op.execute("UPDATE club_membership SET status = 'rejected' WHERE status = 'declined'")
    op.drop_index("uq_notification_idempotency_key", table_name="notification")
    op.drop_column("notification", "idempotency_key")
    op.drop_column("notification", "target_url")
    op.drop_column("club_membership", "decline_reason")
    op.drop_column("club_membership", "declined_count")
