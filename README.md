# WebsiteProfiling

**GitHub:** [github.com/codefrydev/WebsiteProfiling](https://github.com/codefrydev/WebsiteProfiling)

A **console application** for website crawling, link-graph building, and SEO-style site reports. This tools is created to help me to get insite of my website without any ads and bloat ware just total chaos and no limit.

## Install

### Virtual environment (recommended)

Create and activate a venv so dependencies stay isolated:

```bash
# Create a virtual environment in the project directory
python3 -m venv venv

# Activate it (Unix/macOS)
source venv/bin/activate

# Activate it (Windows, Command Prompt)
venv\Scripts\activate.bat

# Activate it (Windows, PowerShell)
venv\Scripts\Activate.ps1
```

To leave the venv later, run `deactivate`.

### Install dependencies

With the venv activated (or using your system Python):

```bash
pip install -r requirements.txt
```

## Input file

Update Input text file with your desired data.

## How to run

**Run all steps** (crawl, then report, then optionally plot) using the default config file `input.txt`:

```bash
python -m src
```

Or specify the config file:

```bash
python -m src --config myconfig.txt
```

## Contribute

Please feel free to Contribute or Fork this repo, change the source code based on your needs. At the End this tool is developed made public to help me and others folks like you and git rid of paywall limitation. Happy burning your website.

Thankyou ✌️