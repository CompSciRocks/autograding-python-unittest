const { execSync, spawnSync, spawn } = require('child_process');
const core = require('@actions/core');
const Table = require('cli-table3');
const fs = require('fs');
const { XMLParser, XMLValidator } = require('fast-xml-parser');

const env = {
    PATH: process.env.PATH,
    FORCE_COLOR: true,
    DOTNET_CLI_HOME: '/tmp',
    DOTNET_NOLOGO: 'true',
    HOME: process.env.HOME,
};

function getInputs() {
    const testName = core.getInput('test-name');
    const testClass = core.getInput('test-class');
    const setupCommand = core.getInput('setup-command');
    const timeout = core.getInput('timeout');
    const maxScore = core.getInput('max-score');
    const partialCredit = core.getInput('partial-credit');
    const testDir = core.getInput('test-dir');

    return {
        testName,
        testClass,
        setupCommand,
        timeout,
        maxScore,
        partialCredit,
        testDir,
    };
}

function btoa(str) {
    return Buffer.from(str).toString('base64');
}

/**
 * Build the results that need to be returned based on the
 * contents of the xml file, or error state if it's not there
 * or not parseable.
 */
function buildResults(xmlFile) {
    xmlFile = xmlFile || '.unittest-results.xml';

    if (!fs.existsSync(xmlFile)) {
        throw new Error(`File not found: ${xmlFile}`);
    }

    const data = fs.readFileSync(xmlFile, 'utf8');

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
    });

    let json = parser.parse(data);

    let testCount = json.testsuites.testsuite['@_tests'];
    let failureCount = json.testsuites.testsuite['@_failures'];
    let errorCount = json.testsuites.testsuite['@_errors'];
    let skippedCount = json.testsuites.testsuite['@_skipped'];

}

function setup(inputs) {

    const result = {
        version: 1,
        status: 'error',
        max_score: inputs.maxScore,
        markdown: '',
        tests: [{
            name: inputs.testName || 'Unknown test',
            status: 'error',
            message: 'Error setting up tests',
            score: 0,
            filename: '',
            line_no: 0,
            execution_time: 0,
        }]
    };


    // Install pytest
    try {
        execSync('pip install pytest', { env });
    } catch (e) {
        core.setFailed('Failed to install pytest');

        console.error('Failed to install pytest');
        console.error('Error:', e.message);

        result.markdown = btoa('**Error:** Failed to install pytest\n\n```\n' + e.message + '\n```');
        result.tests[0].message = e.message;
        result.tests[0].test_code = 'pip install pytest';

        core.setOutput('result', btoa(JSON.stringify(result)));

        return false;
    }

    // Install from requirements.txt, if exists
    try {
        if (fs.existsSync('requirements.txt')) {
            execSync('pip install -r requirements.txt', { env });
        }
    } catch (e) {
        core.setFailed('Failed to install requirements');

        console.error('Failed to install requirements from requirements.txt');
        console.error('Error:', e.message);

        result.markdown = btoa('**Error:** Failed to install requirements from requirements.txt\n\n```\n' + e.message + '\n```');
        result.tests[0].message = e.message;
        result.tests[0].test_code = 'pip install -r requirements.txt';

        core.setOutput('result', btoa(JSON.stringify(result)));

        return false;
    }

    // Run setup command, if exists
    try {
        if (inputs.setupCommand) {
            execSync(inputs.setupCommand, { env });
        }
    } catch (e) {
        core.setFailed('Failed to run setup command');

        console.error('Failed to run setup command');
        console.error('Error:', e.message);

        result.markdown = btoa('**Error:** Failed to run setup command\n\n```\n' + e.message + '\n```');
        result.tests[0].message = e.message;
        result.tests[0].test_code = inputs.setupCommand;

        core.setOutput('result', btoa(JSON.stringify(result)));

        return false;
    }

    return true;
}

function runTests(inputs) {
    let runCommand = 'python -m pytest';
    if (inputs.testClass) {
        if (inputs.testDir) {
            runCommand += ` ${inputs.testDir}/${inputs.testClass}`;
        } else {
            runCommand += ` ${inputs.testClass}`;
        }
    } else {
        runCommand += ` `;
    }

    const testCommand = `${runCommand} --junitxml=.unittest-results.xml`;

    let errorMessage = '';
    try {
        execSync(testCommand, { env });
    } catch (error) {
        // Ignore the error here since it might mean failed tests. Check for .unittest-results.xml
        // to determine if the command failed or not. 
        errorMessage = error.message;
    }

    if (!fs.existsSync('.unittest-results.xml')) {
        core.setFailed('Failed to run tests');

        console.error('Failed to run tests');
        console.error('Error:', errorMessage);

        core.setOutput('result', btoa(JSON.stringify({
            version: 1,
            status: 'error',
            max_score: inputs.maxScore,
            markdown: btoa('**Error:** Failed to run tests\n\n```\n' + errorMessage + '\n```'),
            tests: [{
                name: inputs.testName || 'Unknown test',
                status: 'error',
                message: errorMessage,
                score: 0,
                filename: '',
                line_no: 0,
                execution_time: 0,
            }]
        })));

        return false;
    }

    // Let's parse the xml
    const data = fs.readFileSync('.unittest-results.xml', 'utf8');

    // console.log(data); // just for now

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
    });

    let json = parser.parse(data);

    let testCount = parseInt(json.testsuites.testsuite['@_tests']);
    let failureCount = parseInt(json.testsuites.testsuite['@_failures']);
    let errorCount = parseInt(json.testsuites.testsuite['@_errors']);
    let skippedCount = parseInt(json.testsuites.testsuite['@_skipped']);
    let time = parseFloat(json.testsuites.testsuite['@_time']);

    console.log(testCount, failureCount, errorCount, skippedCount, time);

    if (testCount < 1) {
        core.setFailed('No tests found');

        console.error('No tests found');

        core.setOutput('result', btoa(JSON.stringify({
            version: 1,
            status: 'error',
            max_score: inputs.maxScore,
            markdown: btoa('**Error:** No tests found'),
            tests: [{
                name: inputs.testName || 'Unknown test',
                status: 'error',
                message: 'No tests found',
                score: 0,
                filename: '',
                line_no: 0,
                execution_time: 0,
            }]
        })));
        return false;
    }

    // We have results, let's build the output
    let testScore = 0;
    if (failureCount > 0 || errorCount > 0 || skippedCount > 0) {
        if (inputs.partialCredit) {
            testScore = inputs.maxScore - ((inputs.maxScore / testCount) * (failureCount + errorCount + skippedCount));
        }
    } else if (testCount > 0) {
        testScore = inputs.maxScore;
    }

    console.log('testScore', testScore);

    // Parse the XML/JSON and build the results    
    let markdown = '';
    let text = '';

    let table = new Table({
        head: ['Test', 'Failure'],
        colWidths: [30, 50],
    });

    json.testsuites.testsuite.testcase.forEach(test => {
        if (test.failure) {
            markdown += '| ' + test['@_name'] + ' | ' + test.failure['@_message'] + ' | \n';
            table.push([test['@_name'], test.failure['@_message']]);
        }
        if (test.error) {
            markdown += '| ' + test['@_name'] + ' | ' + test.error['@_message'] + ' | \n';
            table.push([test['@_name'], test.error['@_message']]);
        }
        if (test.skipped) {
            markdown += '| ' + test['@_name'] + ' | ' + test.skipped['@_message'] + ' | \n';
            table.push([test['@_name'], test.skipped['@_message']]);
        }


    });

    if (markdown != '') {
        markdown = '| Test | Failure |\n| --- | --- |\n' + markdown + '\n';
    }

    // Add the header message to the markdown
    let totalFailed = failureCount + errorCount + skippedCount;

    if (totalFailed > 0) {
        if (totalFailed == testCount) {
            markdown = '❌ All tests failed\n\n' + markdown;
            console.log('❌ All tests failed');
        } else {
            markdown = '⚠️ ' + totalFailed + ' of ' + testCount + ' tests failed\n\n' + markdown;
            console.log('⚠️ ' + totalFailed + ' of ' + testCount + ' tests failed');
        }
    } else {
        markdown = '✅ All tests passed\n\n' + markdown;
        console.log('✅ All tests passed');
    }

    console.log("\n\n" + table.toString());

    const result = {
        version: 1,
        status: 'pass',
        max_score: inputs.maxScore,
        markdown: btoa(markdown),
        tests: [{
            name: inputs.testName || 'Unknown test',
            status: 'pass',
            message: '',
            score: testScore,
            filename: '',
            line_no: 0,
            execution_time: time,
        }]
    };

    core.setOutput('result', btoa(JSON.stringify(result)));

    return true;
}


let inputs = getInputs();

if (setup(inputs)) {
    runTests(inputs);
}

