"""
Entry point: python -m src [--config input.txt] [crawl|report|plot]
"""
from .cli import main

if __name__ == "__main__":
    main()
