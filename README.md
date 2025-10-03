# Anki - VS Code Debugging Integration

![VS Code](https://img.shields.io/badge/VS%20Code-007ACC?logo=visual-studio-code&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![Git](https://img.shields.io/badge/Git-F05032?logo=git&logoColor=white)
![Last Commit](https://img.shields.io/github/last-commit/h0tp-ftw/anki-vscode)
![Contributors](https://img.shields.io/github/contributors/h0tp-ftw/anki-vscode)

VSCode setup for debugging Anki add-ons, making add-on development more efficient! 

Made by @h0tp-ftw, based on the work of @RisingOrange

- 🔍 **Live Debugging**: Set breakpoints and inspect variables in real-time
- ⚡ **Quick Testing**: Make code changes directly in VS Code and quickly restart Anki (no hot reloading)
- 🌿 **Branch Switching**: Easily switch between branches, tags or versions of your add-on
- 🌐 **Cross-Platform**: Works on Windows, macOS, and Linux

Prerequisites: **VS Code**, **Python** and **Git**

[![Star History Chart](https://api.star-history.com/svg?repos=h0tp-ftw/anki-vscode&type=Date)](https://www.star-history.com/#h0tp-ftw/anki-vscode&Date)

## Table of Contents
- [Quick Start](#quick-start)
  - [macOS/Linux](#macoslinux-bash)
  - [Windows](#windows-powershell)
- [Compatible Add-ons](#compatible-add-ons)
  - [Making Your Add-on Compatible](#making-your-add-on-compatible)
- [Manual Setup](#manual-setup)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Screenshots](#screenshots)


# Quick Start

This works with ANY Anki add-on, as long as it has a public Github repository and [it is made compatible](#making-your-add-on-compatible).

## macOS/Linux (Bash)

Run this command in your terminal:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/h0tp-ftw/anki-vscode/refs/heads/master/setup.sh | bash
   ```

---

## Windows (PowerShell)

Open **PowerShell as Administrator** and run this command:

```powershell
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/h0tp-ftw/anki-vscode/refs/heads/master/setup.ps1' -OutFile 'setup.ps1'
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup.ps1
```
- this is not a virus (pinky promise)

Although this is not good security practice, I have set it up like this to allow for new contributors to easily be able to set up a debugging environment for Ankimon.
If you are concerned, you can follow the detailed steps given below. 


## Screenshot of me using it in Ankimon
![Screenshot](https://raw.githubusercontent.com/h0tp-ftw/anki-addon-vscode-setup/refs/heads/master/Ankimon%20screenshot.png)

## Compatible Add-ons
- Ankimon (Experimental) - [h0tp-ftw/ankimon](https://github.com/h0tp-ftw/ankimon) - v1.396E and above
- your add-on could be here O_o

## Making Your Add-on Compatible
To ensure your add-on works smoothly with this development environment, it's crucial to prevent personal data and user-specific files from being tracked by Git.
Accidentally committing these files to your repository can cause problems for both you and your users.

Follow these guidelines to make your add-on compatible with this:

1. Use a `.gitignore` file

Your repository must have a .gitignore file to exclude files that are not part of the add-on's source code. This includes:
* Cache files
* User data and configuration files (e.g., meta.json, config.json)
* Log files
* Any other files generated during the add-on's use.

2. Create User Files Dynamically

If your add-on needs user-specific files to function, design it to create them at runtime if they don't exist. For example, your add-on can check for a configuration file
on startup and create a default version if it's missing.

3. Verify Your Setup

After configuring your .gitignore and implementing dynamic file creation, test your setup:
1. Use your add-on in Anki as a normal user would. This should generate user data or cache files.
2. Check the status of your Git repository (e.g., with git status).
3. The only changes you should see are the ones you've made to the add-on's code. No user-specific files should appear in the tracked or untracked files.

Example `.gitignore`

For a working example, you can refer to the .gitignore file used by the Ankimon add-on:
Ankimon .gitignore (https://raw.githubusercontent.com/h0tp-ftw/ankimon/refs/heads/main/.gitignore)

# Manual Setup
<details>
<summary>1. Setting up virtual Python environment</summary>

- clone this repository to your device

```git clone https://github.com/h0tp-ftw/anki-vscode.git /PATH/TO/DIRECTORY/```

- open the folder at /PATH/TO/DIRECTORY/anki-vscode in VS Code, then open the terminal in VS Code

- create a new python virtual environment in the folder

```python3 -m venv venv```

Here, the first venv is the command for a **virtual environment**, and second venv is for the **folder name**.
- activate this virtual environment

LINUX / MAC : `source venv/bin/activate`

WINDOWS : `venv\Scripts\activate`
- install the necessary packages via pip

```pip install -r requirements.txt```

- try running Anki in terminal by using command `anki` or `./anki` in the virtual environment, it should work and it should be separate than your usual Anki installation ! 

</details>

<details>
<summary>2. Setting up add-on environment</summary>

- clone the repo for your add-on to your device, any folder of your choice. Make sure your add-on is compatible with this integration -    
- choose the directory where Anki data can be stored. This can be your native installation (Anki2 folder), or a new folder to keep it as a separate Anki installation. **Note that later, we will choose this directory using the launch.json file.**

- in this folder, make an `addons21` folder (if it is not there already) and **add a symlink to the correct add-on folder for the GitHub clone/branch of your add-on**.
  For example, if your github repo is h0tp-ftw/ankimon and the directory structure is repo / src / Ankimon for the actual add-on content (which is to be used as the add-on directory in a native install), then the symlink should point to wherever that folder is in your system. 

- now open the folder where you cloned the repo. (Not the add-on folder or Anki folder - the folder where you cloned your add-on repo to)

- after opening, you should see a new `.vscode` folder has been added !

- copy the **launch.json** file from this repository and paste it in that folder (.vscode/launch.json) 

- open the `launch.json` file and edit it to change the Anki directory and to link to the anki binary in venv/bin. Make sure to have the FULL directory, not relative paths. You can also link Anki directory to your native install - to get the same experience, files and add-ons as native.


</details>

<details>
<summary>3. Debugging add-on code using virtual Python environment</summary>

- in VS Code, open the folder where you cloned the repo to.
  
- within that VS Code window, navigate to the `__init.py__` file for the add-on. Note - this is the file we have to open to start our debugging! 

- use the `Python: Select interpreter` VSCode action to set the python interpreter to the one in the just created virtual environemnt (to your venv/bin/python binary)

- in the `__init.py__` file, use the function `Python Debugger: Debug using launch.json` to start debugging ! It may also show up as the name "Python Anki", you might have to pick it every time before debugging. 

If Anki opens up when you do the debugging, CONGRATULATIONS! 

Once you learn about debugging, it can be very valuable to get your code tested ! 

You can also repeat this guide to create multiple environments for your Anki add-ons !

</details>




## Troubleshooting 

- If you want to be 100% sure, also test your changes in native Anki before making any commits! This setup uses a virtual Python environment that is partially isolated from the system, so behaviour can be slightly different than system installations.

- ALWAYS debug using the init file! You can still debug other files, e.g. adding breakpoints and checking variables, but you have to start debugging at init file. 

- If you see errors in package importing, likely that you didn't install all packages OR you didn't choose the correct interpreter path.

- If you see errors in importing from relative paths, likely that you misconfigured the paths, or you are not linking the launch.json file 

## Contributing

We welcome contributions! Whether it's:
- Adding support for new add-ons
- Improving the setup scripts
- Fixing bugs or improving documentation

Please feel free to open an issue or submit a pull request. 

I'm also looking for add-on devs that can tell me about their add-on, so that I can make a universal script that works for any addon. Please DM me on Discord (@h0tp) if you can help!

## Screenshots

Click on the image below (it is a VIDEO) to watch how I installed it on my device (no audio):
[![Watch the video](https://files.catbox.moe/qkujp4.png)](https://files.catbox.moe/svqhrb.mp4)

Huge thanks to [RisingOrange](https://github.com/RisingOrange) for this. I don't know how to DM on GitHub - I wanted to send a thank-you message.

<img src="https://user-images.githubusercontent.com/31575114/212190695-3b80024e-2de5-4a5b-ba7e-921a65ad365c.png" width=500>

<img src="https://user-images.githubusercontent.com/31575114/212190704-170d6d4c-945e-4be2-8607-d585e86e31de.png" width=500>
