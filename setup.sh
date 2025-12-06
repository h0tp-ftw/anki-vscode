#!/bin/bash
#
# ==========================================================================
#  Anki-VSCode Setup Script
#  Description : Clones the anki-vscode and ankimon repos, sets up venv,
#                installs dependencies, configures add-on and launch.json.
#  Author      : h0tp-ftw
#  Date        : $(date +"%Y-%m-%d")
#  Usage       : curl -fsSL <URL>/setup.sh | bash
# ==========================================================================

# Colors
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
NC=$'\033[0m' # No Color

# Function to select a directory with a GUI file picker if available
confirm_or_select_directory() {
    local TITLE="$1"
    local DEFAULT_DIR="$2"
    local SELECTED_DIR=""

    echo -n "Do you want to use the default location ($DEFAULT_DIR)? (A GUI file picker will open if you choose 'n') [Y/n]: " > /dev/tty
    read -r response < /dev/tty
    if [[ "$response" =~ ^([nN][oO]|[nN])$ ]]; then
        if command -v zenity &> /dev/null; then
            echo "A GUI file picker will now open to select the directory." > /dev/tty
            ZENITY_ARGS=(--file-selection --directory --title="$TITLE")
            if [ -d "$DEFAULT_DIR" ]; then
                ZENITY_ARGS+=(--filename="$DEFAULT_DIR/")
            fi
            SELECTED_DIR=$(zenity "${ZENITY_ARGS[@]}" 2>/dev/null)
        fi

        if [ -z "$SELECTED_DIR" ]; then
            echo -n "Please enter the custom directory path: " > /dev/tty
            read SELECTED_DIR < /dev/tty
        fi
    else
        SELECTED_DIR="$DEFAULT_DIR"
    fi

    # Expand tilde
    SELECTED_DIR="${SELECTED_DIR/#\~/$HOME}"
    
    echo "$SELECTED_DIR"
}

echo -e "${GREEN}=====================================================================${NC}"
echo -e "  ${YELLOW}Anki-VSCode Integration${NC}"
echo -e "  by ${CYAN}h0tp-ftw${NC} | https://github.com/h0tp-ftw/anki-vscode"
echo -e "  ${CYAN}Date: $(date +"%Y-%m-%d")${NC}"
echo -e "${GREEN}=====================================================================${NC}"
echo ""

set -e

REPO_URL="https://github.com/h0tp-ftw/anki-vscode.git"
REPO_NAME="anki-vscode"

# Check for required tools
if ! command -v git &> /dev/null; then
    echo "Error: git is not installed or not in PATH."
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed or not in PATH."
    exit 1
fi

if ! python3 -m venv --help &> /dev/null; then
    echo "Error: Python venv module is not available."
    exit 1
fi

# Detect OS for Documents folder path
if [[ "$OSTYPE" == "darwin"* ]]; then
    DEFAULT_CLONE_DIR="$HOME/Documents/$REPO_NAME"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    DEFAULT_CLONE_DIR="$HOME/Documents/$REPO_NAME"
else
    DEFAULT_CLONE_DIR="$HOME/Documents/$REPO_NAME"
fi

# --- Main Menu ---
echo -e "\n${YELLOW}--- Main Setup Menu ---${NC}"
echo -e "Please select a setup option:"
echo -e "  ${BOLD}${GREEN}[F] Full Install (Default) ⭐${NC}: Clone anki-vscode, setup venv, install dependencies, clone addon, create symlink, and generate launch.json."
echo -e "  ${YELLOW}[V] Venv Only${NC}: Clone anki-vscode, setup venv, and install dependencies. Skip addon setup."
echo -e "  ${CYAN}[A] Addon Setup Only${NC}: Clone addon and create symlink. (Skips anki-vscode clone, venv setup, and launch.json generation.)"
echo ""

while true; do
    echo -e -n "Enter your choice (${GREEN}F${NC}/${YELLOW}V${NC}/${CYAN}A${NC}) [${GREEN}F${NC}]: "
    read -r CHOICE < /dev/tty
    
    # Default to FULL if input is empty
    if [ -z "$CHOICE" ]; then
        CHOICE="F"
    fi
    
    CHOICE=$(echo "$CHOICE" | tr '[:lower:]' '[:upper:]') # Convert to uppercase

    case "$CHOICE" in
        "F")
            INSTALL_MODE="FULL"
            break
            ;;
        "V")
            INSTALL_MODE="VENV_ONLY"
            break
            ;;
        "A")
            INSTALL_MODE="ADDON_ONLY"
            break
            ;;
        *)
            echo "Invalid choice. Please enter F, V, or A." > /dev/tty
            ;;
    esac
done

# ───────────────────────────────────────────────────────────────────────────
# Add-on Selection (for FULL and ADDON_ONLY modes)
# ───────────────────────────────────────────────────────────────────────────
if [[ "$INSTALL_MODE" == "FULL" || "$INSTALL_MODE" == "ADDON_ONLY" ]]; then
    echo
    echo "Custom Add-on Configuration"
    echo "==========================="
    echo -n "Do you want to install an addon other than Ankimon Experimental? [y/N]: " > /dev/tty
    read  CUSTOM_ADDON_CHOICE < /dev/tty

    IS_ANKIMON=true
    if [[ "$CUSTOM_ADDON_CHOICE" == "y" || "$CUSTOM_ADDON_CHOICE" == "Y" ]]; then
        IS_ANKIMON=false
        echo ""
        echo "Enter custom addon details:"
        echo -n "GitHub repository URL: " > /dev/tty
        read  ADDON_REPO_URL < /dev/tty
        echo -n "Relative path to Anki addon sub-folder in repo (e.g. src/Addon_name, can be left blank if repo is the addon package): " > /dev/tty
        read  ADDON_SRC_PATH < /dev/tty
        echo -n "Addon folder name to be used in addons21 (e.g. 1908235722): " > /dev/tty
        read  ADDON_FOLDER_NAME < /dev/tty
        ADDON_NAME="Custom Addon"
    else
        ADDON_REPO_URL="https://github.com/h0tp-ftw/ankimon.git"
        ADDON_SRC_PATH="src/Ankimon"
        ADDON_FOLDER_NAME="1908235722"
        ADDON_NAME="Ankimon"
    fi
fi

if [[ "$INSTALL_MODE" == "FULL" || "$INSTALL_MODE" == "VENV_ONLY" ]]; then
    echo -e "\n${YELLOW}--- Step 1: Select Repository Clone Location ---${NC}"
    CLONE_DIR=$(confirm_or_select_directory "Select Repository Clone Location" "$DEFAULT_CLONE_DIR")
    CLONE_DIR="${CLONE_DIR/#\~/$HOME}"

    echo "Cloning repository to: $CLONE_DIR"

    # Create parent directory if it doesn't exist
    PARENT_DIR=$(dirname "$CLONE_DIR")
    mkdir -p "$PARENT_DIR"

    # Clone or update repository
    if [ ! -d "$CLONE_DIR" ]; then
        echo "Cloning repository from $REPO_URL ..."
        git clone "$REPO_URL" "$CLONE_DIR"
    else
        echo "Repository directory already exists. Updating..."
        cd "$CLONE_DIR"
        git pull
    fi

    cd "$CLONE_DIR"

    # Virtual environment setup
    DEFAULT_VENV_DIR="$(pwd)/venv"
    echo -e "\n${YELLOW}--- Step 2: Select Virtual Environment Location ---${NC}"
    VENV_DIR=$(confirm_or_select_directory "Select Virtual Environment Location" "$DEFAULT_VENV_DIR")

    echo "Creating virtual environment at: $VENV_DIR"
    mkdir -p "$(dirname "$VENV_DIR")"
    python3 -m venv "$VENV_DIR"

    if [ $? -ne 0 ]; then
        echo "❌ Failed to create the virtual environment."
        exit 1
    fi

    # Install requirements if they exist
    REQUIREMENTS_INSTALLED=false
    if [ -f "requirements.txt" ]; then
        echo ""
        echo "Installing requirements from requirements.txt..."
        "$VENV_DIR/bin/python" -m pip install -q --upgrade pip
        "$VENV_DIR/bin/pip" install -q -r requirements.txt
        
        if [ $? -eq 0 ]; then
            echo "✅ Requirements installed successfully!"
            REQUIREMENTS_INSTALLED=true
        else
            echo "⚠️  Some requirements may have failed to install. Check the output above."
        fi
    else
        echo "No requirements.txt found. Skipping dependency installation."
    fi

    # Activate the virtual environment
    echo ""
    echo "Activating virtual environment..."
    source "$VENV_DIR/bin/activate"

    # Display comprehensive summary
    echo ""
    echo "VIRTUAL ENVIRONMENT SET UP - SUMMARY"
    echo "==========================="
    echo "✅ Repository cloned/updated at: $CLONE_DIR"
    echo "✅ Virtual environment created at: $VENV_DIR"
    if [ "$REQUIREMENTS_INSTALLED" = true ]; then
        echo "✅ Python packages installed from requirements.txt"
    else
        echo "ℹ️  No requirements.txt found - no packages installed"
    fi
    echo "✅ Virtual environment is now ACTIVE"
    echo ""
    echo "To reactivate this environment later, run: source \"$VENV_DIR/bin/activate\""
    echo ""
fi


# ───────────────────────────────────────────────────────────────────────────
# Add-on Installation & launch.json Generation
# ───────────────────────────────────────────────────────────────────────────

if [[ "$INSTALL_MODE" == "FULL" || "$INSTALL_MODE" == "ADDON_ONLY" ]]; then
        echo
        echo "$ADDON_NAME Add-on Installation Mode"
echo "1) Native Anki: Uses your existing Anki addons21 directory."
echo "2) Separate Anki: Creates a new, isolated Anki installation."
echo "Option 1 is convenient; Option 2 is isolated and safer for development."
echo ""
echo -n "Select [1 or 2]: " > /dev/tty
read  MODE < /dev/tty

# Default addon clone location
DEFAULT_ADDON_CLONE_DIR="$HOME/Documents/$(basename "$ADDON_REPO_URL" .git)"
echo -e "\n${YELLOW}--- Step 3: Select Addon Clone Location ---${NC}"
ADDON_CLONE_DIR=$(confirm_or_select_directory "Select Addon Clone Location" "$DEFAULT_ADDON_CLONE_DIR")
mkdir -p "$ADDON_CLONE_DIR"
if [ ! -d "$ADDON_CLONE_DIR/.git" ]; then
  echo "Cloning $ADDON_NAME into $ADDON_CLONE_DIR…" 
  git clone "$ADDON_REPO_URL" "$ADDON_CLONE_DIR"
else
  echo "Updating existing $ADDON_NAME repo…" 
  cd "$ADDON_CLONE_DIR" && git pull && cd - >/dev/null
fi

# ───────────────────────────────────────────────────────────────────────────
# Determine Anki addons21 and base directory with confirmation
echo -e "\n${YELLOW}--- Step 4: Select Anki Base Directory ---${NC}"
if [ "$MODE" = "1" ]; then
  echo
  echo "Detecting native Anki addons21 directory..."
  # Common Linux/macOS locations
  POSSIBLE_1="$HOME/.var/app/net.ankiweb.Anki/data/Anki2/addons21"
  POSSIBLE_2="$HOME/Library/Application Support/Anki2/addons21"
  POSSIBLE_3="$HOME/.local/share/Anki2/addons21"
  ADDONS_DIR=""
  for DIR in "$POSSIBLE_1" "$POSSIBLE_2" "$POSSIBLE_3"; do
    if [ -d "$DIR" ]; then
      echo "Found: $DIR"
      echo -n "Use this directory? [Y/n]: " > /dev/tty
      read -r yn < /dev/tty
      if [[ ! "$yn" =~ ^([nN][oO]|[nN])$ ]]; then
        ADDONS_DIR="$DIR"
      fi
      break # break after finding the first one, regardless of user input
    fi
  done

  # Fallback to manual if not set
  if [ -z "$ADDONS_DIR" ]; then
    echo "Could not auto-detect addons21, or you chose to select a different one. It should contain folders like '$ADDON_FOLDER_NAME' in there (Anki add-on codes)."
    DEFAULT_ANKI_BASE="$HOME/Documents/Anki2"
    ANKI_BASE=$(confirm_or_select_directory "Select Anki Base Directory" "$DEFAULT_ANKI_BASE")
    ADDONS_DIR="$ANKI_BASE/addons21"
  else
    ANKI_BASE="$(dirname "$ADDONS_DIR")"
  fi

elif [ "$MODE" = "2" ]; then
  echo
  DEFAULT_ANKI_BASE="$HOME/Documents/Anki2"
  ANKI_BASE=$(confirm_or_select_directory "Select Anki Base Directory" "$DEFAULT_ANKI_BASE")
  ADDONS_DIR="$ANKI_BASE/addons21"
  mkdir -p "$ADDONS_DIR"

else
  echo "Invalid option; aborting."
  exit 1
fi
# ───────────────────────────────────────────────────────────────────────────

# ───────────────────────────────────────────────────────────────────────────
# User Backup Warning and Double Confirmation

if [ "$IS_ANKIMON" = true ]; then
    echo ""
    echo "⚠️  IMPORTANT: Ankimon User Files Backup Required ⚠️" > /dev/tty
    echo "Your existing Ankimon user files in the Anki add-ons directory WILL BE DELETED and replaced." > /dev/tty
    echo "Please backup the following files from 'user_files' in your Ankimon add-on folder (if present):" > /dev/tty
    echo "  - meta.json, mypokemon.json, mainpokemon.json, badges.json, items.json, teams.json, data.json" > /dev/tty
    if [ "$MODE" = "2" ]; then
        echo "Note: For NEW SEPARATE installations (mode 2), backup is still recommended." > /dev/tty
    fi
    echo "" > /dev/tty
    echo "Backup these files now before proceeding." > /dev/tty
    echo -n "Have you backed up all your user files? Type YES (in all caps) to continue: " > /dev/tty
    read CONFIRM1 < /dev/tty
    if [ "$CONFIRM1" != "YES" ]; then
        echo "Aborting installation. Please backup your files before running this script again." > /dev/tty
        exit 1
    fi
    echo -n "This is your FINAL WARNING. Your current add-on will be DELETED and replaced with the GitHub version. Are you absolutely sure you have backed up your user files? Type YES (in all caps) to proceed: " > /dev/tty
    read CONFIRM2 < /dev/tty
    if [ "$CONFIRM2" != "YES" ]; then
        echo "Aborting installation. Please backup your files before running this script again." > /dev/tty
        exit 1
    fi
    echo "Proceeding with Ankimon add-on installation..." > /dev/tty
else
    echo ""
    echo "⚠️  IMPORTANT: Custom Addon .gitignore Warning ⚠️" > /dev/tty
    echo "Ensure your addon's .gitignore properly ignores cache/user data to prevent data exposure." > /dev/tty
    echo "Existing addon folder in Anki will be removed. More info: https://github.com/h0tp-ftw/anki-vscode?tab=readme-ov-file#making-your-add-on-compatible" > /dev/tty
    echo -n "Have you ensured your addon's .gitignore is correctly configured? Type YES (in all caps) to continue: " > /dev/tty
    read CONFIRM_CUSTOM < /dev/tty
    if [ "$CONFIRM_CUSTOM" != "YES" ]; then
        echo "Aborting installation. Please configure your .gitignore and try again." > /dev/tty
        exit 1
    fi
fi
# ───────────────────────────────────────────────────────────────────────────

# Symlink addon source to addons21 folder
SRC_DIR="$ADDON_CLONE_DIR/$ADDON_SRC_PATH"
TARGET_LINK="$ADDONS_DIR/$ADDON_FOLDER_NAME"

echo "Linking $SRC_DIR -> $TARGET_LINK"

# Create parent directory of target link
mkdir -p "$(dirname "$TARGET_LINK")"

# Remove existing directory or symlink at target
if [ -e "$TARGET_LINK" ] || [ -L "$TARGET_LINK" ]; then
    echo "Removing existing directory or symlink at $TARGET_LINK"
    rm -rf "$TARGET_LINK"
fi

ln -s "$SRC_DIR" "$TARGET_LINK" \
  && echo "Symlink created successfully." \
  || { 
       echo "Failed to link. Please backup $TARGET_LINK and try again.";
       exit 1;
     }

if [[ "$INSTALL_MODE" == "FULL" ]]; then
# Generate .vscode/launch.json in addon repo
LAUNCH_DIR="$ADDON_CLONE_DIR/.vscode"
mkdir -p "$LAUNCH_DIR"
cat > "$LAUNCH_DIR/launch.json" <<EOF
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Python Anki",
            "type": "debugpy",
            "request": "launch",
            "stopOnEntry": false,
            "program": "$VENV_DIR/bin/anki",
            "cwd": "\${workspaceRoot}",
            "env": {},
            "python": "$VENV_DIR/bin/python",
            "args": [
                "-b",
                "$ANKI_BASE"
            ],
            "envFile": "\${workspaceRoot}/.env"
        }
    ]
}
EOF

echo
echo "The automated setup is complete. Now, I will guide you through the final manual steps in VS Code."

# --- STEP 1: Open the Folder ---
echo -e "${YELLOW}--- STEP 1: Open $ADDON_NAME Project in VS Code ---${NC}"
echo "Open VS Code, then 'File' > 'Open Folder...' and select: ${CYAN}$ADDON_CLONE_DIR${NC}"
echo "Verify by checking the Source Control tab (Ctrl+Shift+G) for changes/commits, not 'Initialize Repository'."
echo
echo -n "Press Enter once $ADDON_NAME folder is open in VS Code..." > /dev/tty
read -r < /dev/tty

# --- STEP 2: Start Debugging ---
echo
echo -e "${YELLOW}--- STEP 2: Start Debugging ---${NC}"
echo "Launch Anki with the debugger attached:"
echo "1. Go to 'Run and Debug' (Ctrl+Shift+D / Cmd+Shift+D)."
echo "2. Ensure dropdown says '${GREEN}Python Anki${NC}' (select if needed)."
echo "3. Click the green play button to start debugging."
echo "Anki should open with your $ADDON_NAME add-on loaded."
echo
echo -n "Press Enter once Anki has started..." > /dev/tty
read -r < /dev/tty

# --- FINAL CONFIRMATION ---
echo
echo -e "${GREEN}=====================================================================${NC}"
echo -e "${GREEN}  Setup Complete! Your debugging environment is configured.${NC}"
echo -e "${GREEN}=====================================================================${NC}"
echo
echo "Setup Summary:"
echo -e "  - ${CYAN}Add-on Source:${NC} $ADDON_CLONE_DIR"
echo -e "  - ${CYAN}Virtual Env:${NC}   $VENV_DIR"
echo -e "  - ${CYAN}Anki Data Directory:${NC} $ANKI_BASE"
echo
echo "Please save this information for future reference."
echo ""
fi
echo "Thanks for using the tool! <3 - h0tp"
echo
fi
# ───────────────────────────────────────────────────────────────────────────
