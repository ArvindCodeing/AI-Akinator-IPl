import express from 'express';
import cors from 'cors';
import { GameSession } from './engine.js';
import { rewriteQuestion } from './groq.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.get('/health', (req, res) => res.send('Server is alive!'));




// In-memory store for game sessions
const MAX_QUESTIONS = 10;
const sessions = {};

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15);
}

app.post('/start', async (req, res) => {
    const sessionId = generateSessionId();
    const game = new GameSession();
    sessions[sessionId] = game;

    const nextQ = game.getNextQuestion();
    const text = nextQ ? await rewriteQuestion(nextQ.label) : "I don't know any more questions.";

    res.json({
        sessionId,
        type: "question",
        text: text,
        questionId: nextQ ? nextQ.id : null,
        candidates_pool: game.getTopCandidates(5)
    });
});

app.post('/answer', async (req, res) => {
    const { sessionId, questionId, answer } = req.body;

    const game = sessions[sessionId];
    if (!game) return res.status(404).json({ error: "Session not found" });

    if (questionId) {
        game.answerQuestion(questionId, answer.toLowerCase().replace(/[^a-z]/g, ''));
    }

    const candidates = game.getTopCandidates(5);
    const turn = game.askedQuestions.size;

    // Dynamic confidence threshold
    const threshold = turn >= 9 ? 75 : 85;

    // Check if we reached the confidence threshold
    if (candidates.length > 0 && candidates[0].probability >= threshold) {
        return res.json({
            type: "guess",
            text: candidates[0].name,
            confidence: candidates[0].probability,
            details: turn >= 7 ? "High probability reached in late game." : "Entropy logic successfully isolated this player.",
            candidates_pool: candidates
        });
    }

    // Check if max questions reached (adaptive: extends when user gives vague answers)
    if (game.askedQuestions.size >= game.getAdaptiveMaxQuestions()) {
        return res.json({
            type: "guess",
            text: candidates.length > 0 ? candidates[0].name : "Unknown",
            confidence: candidates.length > 0 ? candidates[0].probability : 0,
            details: "Max questions reached. Best probabilistic guess.",
            candidates_pool: candidates
        });
    }

    const nextQ = game.getNextQuestion();
    if (!nextQ) {
        return res.json({
            type: "guess",
            text: candidates.length > 0 ? candidates[0].name : "Unknown",
            confidence: candidates.length > 0 ? candidates[0].probability : 0,
            details: "Ran out of questions to separate the pool.",
            candidates_pool: candidates
        });
    }

    const text = await rewriteQuestion(nextQ.label);

    res.json({
        type: "question",
        text: text,
        questionId: nextQ.id,
        candidates_pool: candidates
    });
});

app.post('/reject_guess', async (req, res) => {
    const { sessionId, playerName } = req.body;
    const game = sessions[sessionId];
    if (!game) return res.status(404).json({ error: "Session not found" });

    game.rejectCandidate(playerName);

    const candidates = game.getTopCandidates(5);
    const nextQ = game.getNextQuestion();

    if (!nextQ || game.askedQuestions.size >= game.getAdaptiveMaxQuestions()) {
        return res.json({
            type: "guess",
            text: candidates.length > 0 ? candidates[0].name : "Unknown",
            confidence: candidates.length > 0 ? candidates[0].probability : 0,
            details: "Ran out of questions. Best probabilistic guess.",
            candidates_pool: candidates
        });
    }

    const text = await rewriteQuestion(nextQ.label);

    res.json({
        type: "question",
        text: text,
        questionId: nextQ.id,
        candidates_pool: candidates
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Expert System running on http://localhost:${PORT}`);
});
