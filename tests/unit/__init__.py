import sys
from pathlib import Path

# Add project directories to Python path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / 'dashboard'))

print(f"Added to path: {project_root}")
print(f"Added to path: {project_root / 'dashboard'}")
