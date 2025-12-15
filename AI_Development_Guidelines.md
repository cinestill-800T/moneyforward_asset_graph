# AI Development Guidelines

This document outlines the standard protocols and best practices for AI software development within this project. All contributors and AI assistants are expected to adhere to these guidelines to ensure code quality, reproducibility, and maintainability.

## 1. Documentation & Version Control
* **Keep README Up-to-Date:** The `README.md` must always reflect the current state of the code. Update instructions for installation, usage, and configuration whenever the code changes.
* **Semantic Versioning:** Use semantic versioning (e.g., v1.0.0) for releases.
* **Git Best Practices:**
    * Commit messages must be descriptive (e.g., `feat: add data augmentation pipeline` instead of `update code`).
    * Do not commit large data files or model weights. Use `.gitignore` effectively.

## 2. Environment & Dependencies
* **Dependency Pinning:** Explicitly specify library versions in `requirements.txt`, `pyproject.toml`, or `environment.yml` to prevent conflicts (e.g., `pandas==2.0.3`).
* **Python Version:** Clearly state the supported Python version(s).
* **Virtual Environments:** Provide instructions for setting up virtual environments (venv, conda, or Docker) in the README.

## 3. Reproducibility & Experiment Management
* **Random Seeds:** All stochastic processes (numpy, torch, random) must accept a `seed` argument. Set a default fixed seed to ensure reproducibility of experiments.
* **External Configuration:** Do not hardcode parameters. Store hyperparameters, paths, and prompt templates in external configuration files (e.g., `config.yaml`, `.env`, or `settings.json`).
* **Logging:** Implement comprehensive logging. Record input parameters, data statistics, and evaluation metrics for every run.

## 4. Code Quality & Modularity
* **Type Hinting:** Use Python type hints strictly for all function arguments and return values to clarify data types (especially for Tensor shapes and DataFrames).
* **Docstrings:** Write clear docstrings (Google or NumPy style) for all major functions and classes, explaining inputs, outputs, and logic.
* **Separation of Concerns:**
    * Separate logic from data.
    * Separate system prompts (for LLMs) from application logic.
    * Avoid monolithic scripts; organize code into modular functions and classes.

## 5. Security & Robustness
* **Secrets Management:** **NEVER** commit API keys or credentials to the repository. Use environment variables (`.env`) and ensure `.env` is in `.gitignore`.
* **Error Handling:** Implement robust error handling, especially for external API calls (e.g., OpenAI API). Include retry logic (exponential backoff) for network failures or rate limits.
* **Checkpointing:** For long-running tasks (training/inference), implement a mechanism to save progress (checkpoints) to allow resuming after interruptions.

## 6. Project Structure Example

```text
project-root/
├── config/              # Configuration files (yaml, json)
├── data/                # Data storage (ignored by git)
├── logs/                # Execution logs
├── src/                 # Source code
│   ├── __init__.py
│   ├── data_loader.py
│   ├── model.py
│   └── utils.py
├── .env                 # Environment variables (ignored by git)
├── .gitignore
├── requirements.txt
└── README.md