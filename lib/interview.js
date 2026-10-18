const axios = require('axios');
const OLLAMA_URL = 'http://localhost:11434/api/generate';

async function generateInterviewQuestion(targetRole) {
    const prompt = `
    You are an expert technical interviewer hiring for the role of "${targetRole}".
    Generate ONE tough interview question. It can be Theoretical, a Coding challenge, or a Real-world Scenario.
    
    Return ONLY a valid JSON object strictly matching this format without any markdown formatting:
    {
      "type": "Theory | Code | Scenario",
      "question": "The actual question text"
    }
    `;

    const response = await axios.post(OLLAMA_URL, {
        model: 'gemma:2b',
        prompt: prompt,
        stream: false,
        format: 'json'
    });

    try {
        return JSON.parse(response.data.response);
    } catch (e) {
        return { type: "Theory", question: "Explain the core concepts of this role and your primary skills." };
    }
}

async function evaluateInterviewAnswer(targetRole, question, userAnswer) {
    // If the user presses enter without typing, explicitly tell the AI they skipped it
    const candidateAnswer = userAnswer.trim() === '' 
        ? "[The candidate provided no answer or skipped the question. Give them the correct solution.]" 
        : userAnswer;

    const prompt = `
    You are a technical interviewer for the role of "${targetRole}".
    
    Question asked: ${question}
    Candidate's answer: ${candidateAnswer}
    
    Evaluate the candidate's answer. Give constructive feedback. If they provided no answer, just explain the solution clearly.
    
    Return ONLY a valid JSON object strictly matching this format without any markdown formatting:
    {
      "feedback": "Your evaluation of their answer",
      "detailed_solution": "The detailed correct answer or code"
    }
    `;

    const response = await axios.post(OLLAMA_URL, {
        model: 'gemma:2b',
        prompt: prompt,
        stream: false,
        format: 'json'
    });

    try {
        return JSON.parse(response.data.response);
    } catch (e) {
        // Safety fallback if the local model fails to generate strict JSON
        return {
            feedback: "The AI evaluator returned an unformatted response.",
            detailed_solution: response.data.response
        };
    }
}

module.exports = { generateInterviewQuestion, evaluateInterviewAnswer };