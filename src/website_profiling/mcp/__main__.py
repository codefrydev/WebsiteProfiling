from .server import main
from ..console_io import configure_stdio

if __name__ == "__main__":
    configure_stdio()
    main()
