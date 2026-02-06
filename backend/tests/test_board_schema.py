import pytest

from app.schemas.board_onboarding import BoardOnboardingConfirm
from app.schemas.boards import BoardCreate


def test_goal_board_requires_objective_and_metrics_when_confirmed():
    with pytest.raises(ValueError):
        BoardCreate(
            name="Goal Board",
            slug="goal",
            board_type="goal",
            goal_confirmed=True,
        )

    BoardCreate(
        name="Goal Board",
        slug="goal",
        board_type="goal",
        goal_confirmed=True,
        objective="Launch onboarding",
        success_metrics={"emails": 3},
    )


def test_goal_board_allows_missing_objective_before_confirmation():
    BoardCreate(name="Draft", slug="draft", board_type="goal")


def test_general_board_allows_missing_objective():
    BoardCreate(name="General", slug="general", board_type="general")


def test_onboarding_confirm_requires_goal_fields():
    with pytest.raises(ValueError):
        BoardOnboardingConfirm(board_type="goal")

    with pytest.raises(ValueError):
        BoardOnboardingConfirm(board_type="goal", objective="Ship onboarding")

    with pytest.raises(ValueError):
        BoardOnboardingConfirm(board_type="goal", success_metrics={"emails": 3})

    BoardOnboardingConfirm(
        board_type="goal",
        objective="Ship onboarding",
        success_metrics={"emails": 3},
    )

    BoardOnboardingConfirm(board_type="general")
