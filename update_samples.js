const fs = require('fs');

const data = JSON.parse(fs.readFileSync('questions.json', 'utf-8'));

data.forEach(q => {
  if (q.title === 'Sum of Two Numbers') {
    q.sampleInput = '12 15';
    q.sampleOutput = '27';
  } else if (q.title === 'Factorial') {
    q.sampleInput = '4';
    q.sampleOutput = '24';
  } else if (q.title === 'Reverse String') {
    q.sampleInput = 'world';
    q.sampleOutput = 'dlrow';
  } else if (q.title === 'Find Maximum') {
    q.sampleInput = '4\n10 20 5 15';
    q.sampleOutput = '20';
  } else if (q.title === 'Count Vowels') {
    q.sampleInput = 'Programming';
    q.sampleOutput = '3';
  } else if (q.title === 'Palindrome Check') {
    q.sampleInput = 'madam';
    q.sampleOutput = 'YES';
  } else if (q.title === 'FizzBuzz') {
    q.sampleInput = '6';
    q.sampleOutput = '1\n2\nFizz\n4\nBuzz\nFizz';
  } else if (q.title === 'Array Sum') {
    q.sampleInput = '3\n10 20 30';
    q.sampleOutput = '60';
  } else if (q.title === 'Even or Odd') {
    q.sampleInput = '10';
    q.sampleOutput = 'EVEN';
  } else if (q.title === 'String Length') {
    q.sampleInput = 'CodeQuest';
    q.sampleOutput = '9';
  }
});

fs.writeFileSync('questions.json', JSON.stringify(data, null, 2));
console.log('Successfully updated questions.json sample inputs/outputs');
