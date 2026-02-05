#!/usr/bin/env python3
"""
Test runner script for The Big Beautiful Project test suite.

This script provides an easy interface to run tests with various options.
"""
import subprocess
import sys
import argparse
from pathlib import Path


def run_command(cmd, description):
    """Run a command and print the result."""
    print(f"\n{'='*70}")
    print(f"Running: {description}")
    print(f"{'='*70}\n")
    
    result = subprocess.run(cmd, shell=True)
    
    if result.returncode != 0:
        print(f"\n❌ {description} failed with exit code {result.returncode}")
        return False
    else:
        print(f"\n✅ {description} passed")
        return True


def main():
    parser = argparse.ArgumentParser(
        description="Run tests for The Big Beautiful Project",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_tests.py                     # Run all tests
  python run_tests.py --unit              # Run only unit tests
  python run_tests.py --integration       # Run only integration tests
  python run_tests.py --coverage          # Run with coverage report
  python run_tests.py --file test_metrics.py  # Run specific file
  python run_tests.py --verbose           # Run with verbose output
  python run_tests.py --fast              # Run only fast tests
        """
    )
    
    parser.add_argument(
        '--unit', 
        action='store_true',
        help='Run only unit tests'
    )
    parser.add_argument(
        '--integration',
        action='store_true',
        help='Run only integration tests'
    )
    parser.add_argument(
        '--api',
        action='store_true',
        help='Run only API tests'
    )
    parser.add_argument(
        '--database',
        action='store_true',
        help='Run only database tests'
    )
    parser.add_argument(
        '--dashboard',
        action='store_true',
        help='Run only dashboard tests'
    )
    parser.add_argument(
        '--coverage',
        action='store_true',
        help='Run tests with coverage report'
    )
    parser.add_argument(
        '--html-report',
        action='store_true',
        help='Generate HTML coverage report'
    )
    parser.add_argument(
        '--file',
        type=str,
        help='Run tests from specific file'
    )
    parser.add_argument(
        '--test',
        type=str,
        help='Run specific test (e.g., TestClassName::test_method_name)'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Run tests with verbose output'
    )
    parser.add_argument(
        '--fast',
        action='store_true',
        help='Skip slow tests'
    )
    parser.add_argument(
        '--parallel',
        action='store_true',
        help='Run tests in parallel (requires pytest-xdist)'
    )
    parser.add_argument(
        '--pdb',
        action='store_true',
        help='Drop into debugger on failures'
    )
    
    args = parser.parse_args()
    
    # Build pytest command
    cmd_parts = ['pytest']
    
    # Add verbosity
    if args.verbose:
        cmd_parts.append('-vv')
    else:
        cmd_parts.append('-v')
    
    # Add markers
    markers = []
    if args.unit:
        markers.append('unit')
    if args.integration:
        markers.append('integration')
    if args.api:
        markers.append('api')
    if args.database:
        markers.append('database')
    if args.dashboard:
        markers.append('dashboard')
    
    if markers:
        cmd_parts.append(f'-m "{" or ".join(markers)}"')
    
    # Add coverage options
    if args.coverage:
        cmd_parts.extend([
            '--cov=.',
            '--cov-report=term-missing',
        ])
        if args.html_report:
            cmd_parts.append('--cov-report=html')
    
    # Skip slow tests
    if args.fast:
        cmd_parts.append('-m "not slow"')
    
    # Parallel execution
    if args.parallel:
        cmd_parts.append('-n auto')
    
    # Debugger on failure
    if args.pdb:
        cmd_parts.append('--pdb')
    
    # Specific file or test
    if args.file:
        cmd_parts.append(args.file)
        if args.test:
            cmd_parts.append(f'::{args.test}')
    elif args.test:
        cmd_parts.append(args.test)
    
    # Build and run command
    cmd = ' '.join(cmd_parts)
    
    print("="*70)
    print("The Big Beautiful Project - Test Suite")
    print("="*70)
    print(f"\nCommand: {cmd}\n")
    
    success = run_command(cmd, "Test Suite")
    
    # If coverage HTML report was generated, print location
    if args.coverage and args.html_report:
        html_report_path = Path('htmlcov/index.html').absolute()
        if html_report_path.exists():
            print(f"\n📊 Coverage report generated: {html_report_path}")
            print(f"   Open in browser: file://{html_report_path}")
    
    # Print summary
    print("\n" + "="*70)
    if success:
        print("✅ All tests passed!")
    else:
        print("❌ Some tests failed. Check output above.")
    print("="*70)
    
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
