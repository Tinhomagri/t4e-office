"""Models Django do contexto identity — camada de infraestrutura."""
import uuid
from datetime import timedelta

from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """Manager do usuário custom — cria via email, sem username."""

    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("O email é obrigatório.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        # Superusuário não passa por verificação de email — já entra ativo
        extra.setdefault("is_active", True)
        extra.setdefault("email_verified", True)
        if extra.get("is_staff") is not True:
            raise ValueError("Superusuário precisa de is_staff=True.")
        if extra.get("is_superuser") is not True:
            raise ValueError("Superusuário precisa de is_superuser=True.")
        return self._create_user(email, password, **extra)


class UserModel(AbstractBaseUser, PermissionsMixin):
    """Usuário autenticado por email + senha."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, help_text="Email de login")
    full_name = models.CharField(max_length=200, help_text="Nome completo")
    # Data URI otimizado, sem depender de disco local no deploy serverless.
    avatar_image = models.TextField(blank=True, default="")
    job_title = models.CharField(max_length=120, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    bio = models.CharField(max_length=500, blank=True, default="")
    location = models.CharField(max_length=120, blank=True, default="")
    timezone = models.CharField(max_length=64, blank=True, default="America/Sao_Paulo")
    language = models.CharField(max_length=10, blank=True, default="pt-BR")
    theme = models.CharField(max_length=10, blank=True, default="system")
    density = models.CharField(max_length=12, blank=True, default="comfortable")
    notification_preferences = models.JSONField(default=dict, blank=True)
    availability = models.CharField(max_length=12, blank=True, default="available")
    is_active = models.BooleanField(default=False)  # ativo apenas após verificar email
    email_verified = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False, help_text="Acesso ao admin")
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        db_table = "identity_user"
        verbose_name = "Usuário"
        verbose_name_plural = "Usuários"

    def __str__(self) -> str:
        return self.email


class EmailVerificationToken(models.Model):
    """Token one-time para verificação de email após cadastro."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        UserModel, on_delete=models.CASCADE, related_name="verification_tokens"
    )
    token = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "identity_email_verification_token"

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=24)
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at


class PasswordResetToken(models.Model):
    """Token one-time para redefinição de senha (válido 1h)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        UserModel, on_delete=models.CASCADE, related_name="password_reset_tokens"
    )
    token = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "identity_password_reset_token"

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=1)
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at


class WorkspaceModel(models.Model):
    """Espaço de trabalho que agrupa membros e projetos."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120, help_text="Nome do workspace")
    slug = models.SlugField(max_length=140, unique=True, help_text="Identificador na URL")
    owner = models.ForeignKey(
        UserModel, on_delete=models.PROTECT, related_name="owned_workspaces"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "identity_workspace"
        verbose_name = "Workspace"
        verbose_name_plural = "Workspaces"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class MembershipModel(models.Model):
    """Vínculo de um usuário a um workspace com um papel."""

    ROLE_CHOICES = [
        ("owner", "Owner"),
        ("admin", "Admin"),
        ("member", "Member"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        WorkspaceModel, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        UserModel, on_delete=models.CASCADE, related_name="memberships"
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="member")
    allowed_spaces = models.JSONField(
        null=True,
        blank=True,
        default=list,
        help_text="Spaces que admin ou membro pode ver; só owner vê todos.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "identity_membership"
        verbose_name = "Membro"
        verbose_name_plural = "Membros"
        # Um usuário só pode ter um vínculo por workspace
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user"], name="unique_workspace_user"
            )
        ]

    def __str__(self) -> str:
        return f"{self.user} @ {self.workspace} ({self.role})"


class InvitationModel(models.Model):
    """Convite por email para ingressar em um workspace."""

    STATUS_CHOICES = [
        ("pending", "Pendente"),
        ("accepted", "Aceito"),
        ("revoked", "Revogado"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        WorkspaceModel, on_delete=models.CASCADE, related_name="invitations"
    )
    email = models.EmailField(help_text="Email do convidado")
    role = models.CharField(max_length=10, choices=MembershipModel.ROLE_CHOICES)
    token = models.CharField(max_length=64, unique=True, help_text="Token do convite")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "identity_invitation"
        verbose_name = "Convite"
        verbose_name_plural = "Convites"

    def __str__(self) -> str:
        return f"{self.email} -> {self.workspace} ({self.status})"


class RoleAuditLog(models.Model):
    """Registro imutável de mudanças de papel e remoções de membro.

    Nunca é atualizado — append-only. Permite responder "quem mudou o quê e quando"
    durante a defesa do projeto (segurança auditável, como o Jira faz).
    """

    ACTION_CHOICES = [
        ("role_changed", "Papel alterado"),
        ("member_removed", "Membro removido"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        WorkspaceModel, on_delete=models.CASCADE, related_name="audit_logs"
    )
    actor_id = models.UUIDField(help_text="ID de quem realizou a ação")
    target_user_id = models.UUIDField(help_text="ID de quem foi afetado")
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    old_role = models.CharField(max_length=10, blank=True, default="")
    new_role = models.CharField(max_length=10, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "identity_role_audit_log"
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"[{self.action}] {self.actor_id} → {self.target_user_id} @ {self.workspace_id}"


class PersonalAccessToken(models.Model):
    """Token pessoal de API, usado por integrações externas (ex.: MCP do Claude).

    Vale como a permissão normal do usuário dono — sem sistema de escopo
    separado. Sem expiração automática: só revogação manual (`revoked_at`).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        UserModel, on_delete=models.CASCADE, related_name="personal_tokens"
    )
    name = models.CharField(max_length=100, blank=True)
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "identity_personal_access_token"

    def __str__(self) -> str:
        return self.name or str(self.id)
