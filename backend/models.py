from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")  # 'admin' | 'user'
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    avatar_url = Column(String, nullable=True)

    # Relationships
    owned_polls = relationship("Poll", back_populates="owner")


class Poll(Base):
    __tablename__ = "polls"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    description = Column(Text)
    deadline_iso = Column(DateTime)
    type = Column(String, nullable=False)  # 'single' or 'multi'
    max_selections = Column(Integer, default=1)
    is_anonymous = Column(Boolean, default=True)  # True = анонимное, False = публичное
    created_at = Column(DateTime, default=datetime.utcnow)
    owner_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    owner = relationship("User", back_populates="owned_polls")
    variants = relationship("PollVariant", back_populates="poll", cascade="all, delete-orphan")
    votes = relationship("Vote", back_populates="poll", cascade="all, delete-orphan")


class PollVariant(Base):
    __tablename__ = "poll_variants"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    poll_id = Column(String, ForeignKey("polls.id"), nullable=False)
    label = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    poll = relationship("Poll", back_populates="variants")
    votes = relationship("Vote", back_populates="variant")


class Vote(Base):
    __tablename__ = "votes"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    poll_id = Column(String, ForeignKey("polls.id"), nullable=False)
    variant_id = Column(String, ForeignKey("poll_variants.id"), nullable=False)
    user_id = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Unique constraint: one vote per user per poll
    __table_args__ = (
        UniqueConstraint('poll_id', 'user_id', 'variant_id', name='unique_user_poll_variant'),
    )
    
    # Relationships
    poll = relationship("Poll", back_populates="votes")
    variant = relationship("PollVariant", back_populates="votes")
