#!/bin/bash
# Runs all test suites in the testing/ directory.
# Usage: bash testing/run_all.sh

dir="$(dirname "$0")"
exit_code=0

for test_file in "$dir"/run_*.mjs; do
    echo "=== $(basename "$test_file") ==="
    node "$test_file"
    if [ $? -ne 0 ]; then
        exit_code=1
    fi
    echo ""
done

exit $exit_code
