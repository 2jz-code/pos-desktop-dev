#!/usr/bin/env python
"""
Phase 7 Test Runner
===================

Run all Phase 7 multi-location integration tests.

Usage:
    python run_phase7_tests.py              # Run all Phase 7 tests
    python run_phase7_tests.py --verbose    # Verbose output
    python run_phase7_tests.py --coverage   # With coverage report
    python run_phase7_tests.py --parallel   # Run in parallel
"""
import sys
import subprocess


def run_tests(verbose=False, coverage=False, parallel=False):
    """Run Phase 7 tests with pytest"""

    cmd = ['pytest']

    # Test files
    test_files = [
        'settings/tests/test_multi_location_phase7.py',
        'core_backend/tests/test_multi_location_api_phase7.py',
    ]

    # Markers
    cmd.extend(['-m', 'phase7'])

    # Add flags
    if verbose:
        cmd.append('-v')
    else:
        cmd.append('-v')  # Always verbose for Phase 7

    if coverage:
        cmd.extend(['--cov=.', '--cov-report=html', '--cov-report=term'])

    if parallel:
        cmd.extend(['-n', 'auto'])  # Requires pytest-xdist

    # Add test files
    cmd.extend(test_files)

    # Descriptive output
    cmd.extend([
        '--tb=short',  # Short traceback format
        '--color=yes',  # Colored output
    ])

    print("=" * 80)
    print("Phase 7: Multi-Location Integration Tests")
    print("=" * 80)
    print(f"\nRunning: {' '.join(cmd)}\n")

    # Run tests
    result = subprocess.run(cmd, cwd='.')
    return result.returncode


def main():
    """Main entry point"""
    args = sys.argv[1:]

    verbose = '--verbose' in args or '-v' in args
    coverage = '--coverage' in args or '--cov' in args
    parallel = '--parallel' in args or '-n' in args

    exit_code = run_tests(verbose=verbose, coverage=coverage, parallel=parallel)

    print("\n" + "=" * 80)
    if exit_code == 0:
        print("✅ All Phase 7 tests passed!")
    else:
        print("❌ Some Phase 7 tests failed!")
    print("=" * 80)

    sys.exit(exit_code)


if __name__ == '__main__':
    main()
