# Python Auto Grading Action

Python unit test grading action for GitHub Classroom.

Based on https://github.com/classroom-resources/autograding-io-grader/, modified to
run and parse Python `unittest` tests. 

## Usage

Currently, probably shouldn't. Still a work in progress. 

## Inputs

| Input | Required | Default | Description |
|-------|----------|-------------|---- |
| max-score | ✖ | 0 | Max score for this test reported back to GitHub Classroom |
| partial-credit | ✖ | true | Whether to give partial credit for this test |
| setup-command | ✖ | _none_ | Command to run before running tests |
| test-class | ✖ | _none_ | Filename and class to run formatted `filename.py::ClassName`. Leave blank to use `discover`. |
| test-dir | ✖ | _none_ | Directory to run tests in. Leave blank to use the root directory. |
| test-name | ✅ | | Unique identifier for this test |
| timeout | ✖ | 2 | Timeout for running tests in minutes |