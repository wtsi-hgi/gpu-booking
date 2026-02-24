"""Pydantic models used across the API layer."""

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class MessageResponse(BaseModel):
    """Standard message response model."""

    message: str


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str
    database: str


class UserInfo(BaseModel):
    """Authenticated user information used by auth dependencies."""

    email: str
    is_admin: bool
    auth_mode: str


class GpuTypeResponse(BaseModel):
    """GPU type response payload."""

    id: int
    name: str
    gram_gb: int
    system_memory_gb: int
    total_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GpuTypeCreate(BaseModel):
    """GPU type create payload."""

    name: str
    gram_gb: int = Field(gt=0)
    system_memory_gb: int = Field(gt=0)
    total_count: int = Field(gt=0)


class GpuTypeUpdate(BaseModel):
    """GPU type update payload."""

    name: str | None = None
    gram_gb: int | None = Field(default=None, gt=0)
    system_memory_gb: int | None = Field(default=None, gt=0)
    total_count: int | None = Field(default=None, gt=0)


class WorkflowTypeResponse(BaseModel):
    """Workflow type response payload."""

    id: int
    name: str

    model_config = {"from_attributes": True}


class WorkflowTypeCreate(BaseModel):
    """Workflow type create payload."""

    name: str


class WorkflowTypeUpdate(BaseModel):
    """Workflow type update payload."""

    name: str | None = None


class GramOptionResponse(BaseModel):
    """GRAM option response payload."""

    id: int
    label: str
    value_gb: int
    sort_order: int

    model_config = {"from_attributes": True}


class GramOptionCreate(BaseModel):
    """GRAM option create payload."""

    label: str
    value_gb: int = Field(gt=0)
    sort_order: int = Field(ge=0)


class GramOptionUpdate(BaseModel):
    """GRAM option update payload."""

    label: str | None = None
    value_gb: int | None = Field(default=None, gt=0)
    sort_order: int | None = Field(default=None, ge=0)


class MemoryOptionResponse(BaseModel):
    """Memory option response payload."""

    id: int
    label: str
    value_gb: int
    sort_order: int

    model_config = {"from_attributes": True}


class MemoryOptionCreate(BaseModel):
    """Memory option create payload."""

    label: str
    value_gb: int = Field(gt=0)
    sort_order: int = Field(ge=0)


class MemoryOptionUpdate(BaseModel):
    """Memory option update payload."""

    label: str | None = None
    value_gb: int | None = Field(default=None, gt=0)
    sort_order: int | None = Field(default=None, ge=0)


class BookingStatus(StrEnum):
    """Supported lifecycle states for bookings."""

    unconfirmed = "unconfirmed"
    confirmed = "confirmed"
    tentative = "tentative"
    spot = "spot"
    rejected = "rejected"
    cancelled = "cancelled"


class BookingCreate(BaseModel):
    """Booking create payload."""

    gpu_type_id: int
    gpu_count: int = Field(gt=0)
    gram_option_id: int
    memory_option_id: int
    workflow_type_id: int
    start_date: date
    end_date: date
    alt_email: str | None = None
    project_name: str | None = None
    project_pi: str | None = None
    project_grant_number: str | None = None
    technical_lead: str | None = None
    event_start_date: date | None = None
    event_end_date: date | None = None


class AdminBookingUpdate(BaseModel):
    """Admin booking update payload."""

    status: BookingStatus | None = None
    admin_notes: str | None = None
    gpu_type_id: int | None = None
    gpu_count: int | None = Field(default=None, gt=0)
    gram_option_id: int | None = None
    memory_option_id: int | None = None
    workflow_type_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    alt_email: str | None = None
    project_name: str | None = None
    project_pi: str | None = None
    project_grant_number: str | None = None
    technical_lead: str | None = None
    event_start_date: date | None = None
    event_end_date: date | None = None


class BookingResponse(BaseModel):
    """Booking response payload."""

    id: int
    user_email: str
    gpu_type_id: int
    gpu_type_name: str
    gpu_count: int
    gram_option_id: int
    gram_label: str
    memory_option_id: int
    memory_label: str
    workflow_type_id: int
    workflow_type_name: str
    start_date: date
    end_date: date
    status: BookingStatus
    alt_email: str | None
    project_name: str | None
    project_pi: str | None
    project_grant_number: str | None
    technical_lead: str | None
    event_start_date: date | None
    event_end_date: date | None
    admin_notes: str | None
    admin_modified_by: str | None
    admin_modified_at: datetime | None
    created_at: datetime
    updated_at: datetime
    warnings: list[str]


class DailyCapacity(BaseModel):
    """Daily capacity metrics for one GPU type."""

    date: date
    gpu_type_id: int
    gpu_type_name: str
    total: int
    confirmed_used: int
    pending_used: int
    available: int
    user_used: int
    user_percent: float
    warnings: list[str]


class CapacityWarning(BaseModel):
    """Warning or block metadata for capacity validation rules."""

    rule: str
    message: str
    severity: str


class BookingValidation(BaseModel):
    """Result of validating a proposed booking against capacity rules."""

    valid: bool
    warnings: list[CapacityWarning]
    blocked: bool
    block_reason: str | None = None
