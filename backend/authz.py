from typing import Dict, Optional, Set

from models import Poll as PollModel
from models import User as UserModel

PERM_USERS_READ_ALL = "users:read:all"
PERM_USERS_READ_SELF = "users:read:self"
PERM_USERS_ROLE_MANAGE = "users:role:manage"
PERM_PROFILE_READ = "profile:read"
PERM_PROFILE_UPDATE = "profile:update"
PERM_PROFILE_AVATAR_UPDATE = "profile:avatar:update"
PERM_POLLS_CREATE = "polls:create"
PERM_POLLS_ASSIGN_OWNER = "polls:assign_owner"
PERM_POLLS_VOTE = "polls:vote"
PERM_POLLS_DELETE_ANY = "polls:delete:any"
PERM_POLLS_DELETE_OWN = "polls:delete:own"

ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    "admin": {
        PERM_USERS_READ_ALL,
        PERM_USERS_READ_SELF,
        PERM_USERS_ROLE_MANAGE,
        PERM_PROFILE_READ,
        PERM_PROFILE_UPDATE,
        PERM_PROFILE_AVATAR_UPDATE,
        PERM_POLLS_CREATE,
        PERM_POLLS_ASSIGN_OWNER,
        PERM_POLLS_VOTE,
        PERM_POLLS_DELETE_ANY,
        PERM_POLLS_DELETE_OWN,
    },
    "user": {
        PERM_USERS_READ_SELF,
        PERM_PROFILE_READ,
        PERM_PROFILE_UPDATE,
        PERM_PROFILE_AVATAR_UPDATE,
        PERM_POLLS_CREATE,
        PERM_POLLS_VOTE,
        PERM_POLLS_DELETE_OWN,
    },
}


def role_permissions(role_name: Optional[str]) -> Set[str]:
    # Deny by default for unknown or missing roles.
    return ROLE_PERMISSIONS.get((role_name or "").strip().lower(), set())


def user_has_permission(user: UserModel, permission: str) -> bool:
    return permission in role_permissions(user.role)


def can_manage_poll(user: UserModel, poll: PollModel) -> bool:
    if user_has_permission(user, PERM_POLLS_DELETE_ANY):
        return True
    return (
        user_has_permission(user, PERM_POLLS_DELETE_OWN)
        and poll.owner_user_id is not None
        and poll.owner_user_id == user.id
    )
