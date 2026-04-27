"""SQLAlchemy ORM models used for database bootstrap in phase A1."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    """Base declarative class for all ORM models."""


class BookingStatus(StrEnum):
    """Supported lifecycle states for bookings."""

    unconfirmed = "unconfirmed"
    confirmed = "confirmed"
    tentative = "tentative"
    spot = "spot"
    rejected = "rejected"
    cancelled = "cancelled"


class Admin(Base):
    """Represent administrator email records."""

    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.current_timestamp(),
    )


class GpuType(Base):
    """Represent GPU inventory types."""

    __tablename__ = "gpu_types"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    gram_gb: Mapped[int] = mapped_column(Integer, nullable=False)
    system_memory_gb: Mapped[int] = mapped_column(Integer, nullable=False)
    total_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.current_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    bookings: Mapped[list[Booking]] = relationship(back_populates="gpu_type")


class WorkflowType(Base):
    """Represent workflow categories."""

    __tablename__ = "workflow_types"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.current_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    bookings: Mapped[list[Booking]] = relationship(back_populates="workflow_type")


class GramOption(Base):
    """Represent selectable GRAM options."""

    __tablename__ = "gram_options"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    value_gb: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.current_timestamp(),
    )

    bookings: Mapped[list[Booking]] = relationship(back_populates="gram_option")


class MemoryOption(Base):
    """Represent selectable memory options."""

    __tablename__ = "memory_options"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String, nullable=False)
    value_gb: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.current_timestamp(),
    )

    bookings: Mapped[list[Booking]] = relationship(back_populates="memory_option")


class Booking(Base):
    """Represent booking records for GPU requests."""

    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("gpu_count > 0", name="ck_bookings_gpu_count_gt_0"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_email: Mapped[str] = mapped_column(String, nullable=False)
    gpu_type_id: Mapped[int] = mapped_column(ForeignKey("gpu_types.id"), nullable=False)
    gpu_count: Mapped[int] = mapped_column(Integer, nullable=False)
    gram_option_id: Mapped[int] = mapped_column(
        ForeignKey("gram_options.id"), nullable=False
    )
    memory_option_id: Mapped[int] = mapped_column(
        ForeignKey("memory_options.id"), nullable=False
    )
    workflow_type_id: Mapped[int] = mapped_column(
        ForeignKey("workflow_types.id"), nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        SqlEnum(BookingStatus, native_enum=False),
        nullable=False,
        default=BookingStatus.unconfirmed,
        server_default=BookingStatus.unconfirmed.value,
    )
    alt_email: Mapped[str | None] = mapped_column(String, nullable=True)
    project_name: Mapped[str | None] = mapped_column(String, nullable=True)
    project_pi: Mapped[str | None] = mapped_column(String, nullable=True)
    project_grant_number: Mapped[str | None] = mapped_column(String, nullable=True)
    technical_lead: Mapped[str | None] = mapped_column(String, nullable=True)
    event_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    event_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    admin_notes: Mapped[str | None] = mapped_column(String, nullable=True)
    admin_modified_by: Mapped[str | None] = mapped_column(String, nullable=True)
    admin_modified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.current_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    gpu_type: Mapped[GpuType] = relationship(back_populates="bookings")
    workflow_type: Mapped[WorkflowType] = relationship(back_populates="bookings")
    gram_option: Mapped[GramOption] = relationship(back_populates="bookings")
    memory_option: Mapped[MemoryOption] = relationship(back_populates="bookings")
