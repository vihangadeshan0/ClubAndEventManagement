"""Persist student account approval and decline decisions.

Revision ID: 5d8ac42e7f10
Revises: 41b7c6d2a903
Create Date: 2026-11-01
"""
from alembic import op
import sqlalchemy as sa


revision = "5d8ac42e7f10"
down_revision = "41b7c6d2a903"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user", sa.Column("verification_status", sa.String(length=16), nullable=False,
                                      server_default="pending"))
    op.add_column("user", sa.Column("verification_decline_reason", sa.String(length=250), nullable=True))
    op.create_index("ix_user_verification_status", "user", ["verification_status"], unique=False)
    op.execute("UPDATE user SET verification_status = CASE WHEN verified = 1 THEN 'approved' ELSE 'pending' END")


def downgrade():
    op.drop_index("ix_user_verification_status", table_name="user")
    op.drop_column("user", "verification_decline_reason")
    op.drop_column("user", "verification_status")
