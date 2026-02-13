# Add-on Compatibility Guidelines

To ensure your add-on works smoothly with this development environment:

## 1. Use a `.gitignore`
Exclude files that are not part of the source code:
- `meta.json`, `config.json` (user-specific)
- `user_files/` (user-specific)
- `__pycache__/`, `*.pyc`
- Log files and temporary data

## 2. Dynamic File Creation
Design your add-on to create required user files (like `config.json`) at runtime if they are missing. This prevents accidental commits of personal data while allowing you to test your add-on with different configurations and code changes.

## 3. Verification
1. After a fresh install of your add-on, use your add-on normally in Anki.
2. Check `git status` in your add-on repository.
3. Only your code changes should appear. No user-specific or temporary files should be tracked.
