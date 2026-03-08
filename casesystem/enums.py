from enum import Enum


class UserStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    PENDING = "pending"


class SessionStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    COMPROMISED = "compromised"
    EXPIRED = "expired"


class RefreshTokenStatus(str, Enum):
    ACTIVE = "active"
    ROTATED = "rotated"
    REVOKED = "revoked"
    REUSED_DETECTED = "reused_detected"
    EXPIRED = "expired"


class CounterType(str, Enum):
    ACCOUNT_IP = "account_ip"
    ACCOUNT = "account"
    IP = "ip"


class RoleCode(str, Enum):
    T1 = "T1"
    T2 = "T2"
    T3 = "T3"
    ADMIN = "ADMIN"
    CUSTOMER = "CUSTOMER"


class SecurityEventType(str, Enum):
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILED = "LOGIN_FAILED"
    USER_NOT_FOUND = "USER_NOT_FOUND"
    PASSWORD_MISMATCH = "PASSWORD_MISMATCH"
    ACCOUNT_IP_THROTTLED = "ACCOUNT_IP_THROTTLED"
    ACCOUNT_TEMP_LOCKED = "ACCOUNT_TEMP_LOCKED"
    IP_RATE_LIMITED = "IP_RATE_LIMITED"
    SESSION_REVOKED = "SESSION_REVOKED"
    REFRESH_TOKEN_REUSED = "REFRESH_TOKEN_REUSED"
    USER_DISABLED = "USER_DISABLED"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"
    ROLE_SWITCHED = "ROLE_SWITCHED"

