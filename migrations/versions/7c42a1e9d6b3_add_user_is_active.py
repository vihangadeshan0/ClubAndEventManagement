"""Add active status to user accounts.

Revision ID: 7c42a1e9d6b3
Revises: 1002260ad7bd
Create Date: 2026-11-01
"""
from alembic import op
import sqlalchemy as sa


revision = "7c42a1e9d6b3"
down_revision = "1002260ad7bd"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_index("ix_user_is_active", "user", ["is_active"], unique=False)


def downgrade():
    op.drop_index("ix_user_is_active", table_name="user")
    op.drop_column("user", "is_active")
