import fs from 'fs';

// Load the full dataset
const playersDB = JSON.parse(fs.readFileSync('./players.json', 'utf-8'));

export const ATTRIBUTES = [
    // BUCKET 1: Broad Filters (Nationality, Core Role, Status)
    { id: 'is_indian', bucket: 1, label: 'Is the player an Indian citizen?' },
    { id: 'is_overseas', bucket: 1, label: 'Is the player an overseas/foreign cricketer?' },
    { id: 'is_batsman', bucket: 1, label: 'Is the player primarily a batsman?' },
    { id: 'is_bowler', bucket: 1, label: 'Is the player primarily a bowler?' },
    { id: 'is_allrounder', bucket: 1, label: 'Is the player an all-rounder?' },
    { id: 'is_wicketkeeper', bucket: 1, label: 'Is the player a wicketkeeper?' },
    { id: 'is_retired', bucket: 1, label: 'Has the player retired from the IPL?' },
    { id: 'active_in_2026', bucket: 1, label: 'Is the player expected to be active in 2026?' },

    // BUCKET 2: Medium Filters (Legacy, Captaincy, Playstyle, Franchise)
    { id: 'has_captained', bucket: 2, label: 'Has the player captained an IPL team?' },
    { id: 'is_left_handed_bat', bucket: 2, label: 'Is the player a left-handed batsman?' },
    { id: 'is_spin_bowler', bucket: 2, label: 'Is the player a spin bowler?' },
    { id: 'is_fast_bowler', bucket: 2, label: 'Is the player a fast/pace bowler?' },
    { id: 'is_left_arm_bowler', bucket: 2, label: 'Is the player a left-arm bowler?' },
    { id: 'played_csk', bucket: 2, label: 'Has the player played for Chennai Super Kings (CSK)?' },
    { id: 'played_mi', bucket: 2, label: 'Has the player played for Mumbai Indians (MI)?' },
    { id: 'played_rcb', bucket: 2, label: 'Has the player played for Royal Challengers Bangalore (RCB)?' },
    { id: 'played_kkr', bucket: 2, label: 'Has the player played for Kolkata Knight Riders (KKR)?' },
    { id: 'played_srh', bucket: 2, label: 'Has the player played for Sunrisers Hyderabad (SRH)?' },
    { id: 'played_rr', bucket: 2, label: 'Has the player played for Rajasthan Royals (RR)?' },
    { id: 'played_dc', bucket: 2, label: 'Has the player played for Delhi Capitals (DC)?' },
    { id: 'played_pbks', bucket: 2, label: 'Has the player played for Punjab Kings (PBKS)?' },
    { id: 'played_gt', bucket: 2, label: 'Has the player played for Gujarat Titans (GT)?' },
    { id: 'played_lsg', bucket: 2, label: 'Has the player played for Lucknow Super Giants (LSG)?' },
    { id: 'played_defunct_team', bucket: 2, label: 'Has the player played for a defunct team (e.g. GL, RPS, PWI)?' },

    // BUCKET 3: Specific Filters (Signature Stats, Accolades)
    { id: 'won_ipl_title', bucket: 3, label: 'Has the player won an IPL title?' },
    { id: 'won_orange_cap', bucket: 3, label: 'Has the player won the Orange Cap?' },
    { id: 'won_purple_cap', bucket: 3, label: 'Has the player won the Purple Cap?' },
    { id: 'has_hattrick', bucket: 3, label: 'Has the player taken a hat-trick in the IPL?' },
    { id: 'has_scored_century', bucket: 3, label: 'Has the player scored a century in the IPL?' },
    { id: 'has_taken_5_wickets', bucket: 3, label: 'Has the player taken a 5-wicket haul in an IPL match?' },
    { id: 'is_opener', bucket: 3, label: 'Does the player usually open the batting?' },
    { id: 'has_5000_runs', bucket: 3, label: 'Has the player scored more than 5000 runs in the IPL?' },
    { id: 'has_150_wickets', bucket: 3, label: 'Has the player taken more than 150 wickets in the IPL?' },
    { id: 'is_under_19_graduate', bucket: 3, label: 'Did the player come from the Under-19 World Cup system?' },
    { id: 'is_coach_now', bucket: 3, label: 'Is the player currently serving as a coach or mentor?' }
];

export class GameSession {
    constructor() {
        // Initialize probabilities equally for the full pool
        const initialProb = 1.0 / playersDB.length;
        this.players = playersDB.map(p => ({ ...p, probability: initialProb }));
        this.askedQuestions = new Set();
        this.vagueCount = 0; // Tracks how many maybe/dontknow answers given
    }

    /**
     * Returns how many max questions the engine should ask.
     * Extends the limit by 1 for every 2 vague answers (max 14).
     */
    getAdaptiveMaxQuestions() {
        return Math.min(10 + Math.floor(this.vagueCount / 2), 14);
    }

    /**
     * Checks if a player has the given attribute based on 1/0 schema
     */
    playerHasAttribute(player, attr) {
        return player[attr.id] === 1;
    }

    /**
     * Bayesian update based on user response
     */
    answerQuestion(attrId, userResponse) {
        this.askedQuestions.add(attrId);
        const attr = ATTRIBUTES.find(a => a.id === attrId);

        // Track vague answers so we can extend question limit adaptively
        if (userResponse === 'maybe' || userResponse === 'dontknow') {
            this.vagueCount++;
        }

        // Compute dataset prior for this attribute (fraction of players who have it)
        // Used to give 'dontknow' a slight lean instead of a completely neutral 0.5/0.5
        const prior = this.players.reduce((sum, p) =>
            sum + (this.playerHasAttribute(p, attr) ? p.probability : 0), 0);

        const multipliers = {
            'yes':  { match: 1.0,  unmatch: 0.005 },
            'no':   { match: 0.005, unmatch: 1.0 },
            // 'maybe': soft signal — lean 75/25 toward the correct side
            'maybe':    { match: 0.75, unmatch: 0.25 },
            // 'dontknow': neutral but prior-weighted — lean slightly based on how common the attribute is
            'dontknow': {
                match:   0.5 + (prior - 0.5) * 0.15,   // slight lean toward prior
                unmatch: 0.5 - (prior - 0.5) * 0.15
            }
        };

        const m = multipliers[userResponse] || multipliers['dontknow'];

        let newTotalProb = 0;
        for (const p of this.players) {
            const hasAttr = this.playerHasAttribute(p, attr);
            p.probability *= hasAttr ? m.match : m.unmatch;
            newTotalProb += p.probability;
        }

        // Normalize
        if (newTotalProb > 0) {
            for (const p of this.players) {
                p.probability /= newTotalProb;
            }
        }

        // Mutual Exclusivity Logic (Secondary Update)
        this.applyMutualExclusivity(attrId, userResponse);
    }

    applyMutualExclusivity(attrId, userResponse) {
        const exclusivityMap = {
            'is_spin_bowler': { target: 'is_fast_bowler', response: 'yes', penalty: 0.1 },
            'is_fast_bowler': { target: 'is_spin_bowler', response: 'yes', penalty: 0.1 },
            'is_wicketkeeper': { target: 'is_bowler', response: 'yes', penalty: 0.3 }
        };

        const rule = exclusivityMap[attrId];
        if (rule && userResponse.toLowerCase() === rule.response) {
            let total = 0;
            for (const p of this.players) {
                if (p[rule.target] === 1) {
                    p.probability *= rule.penalty;
                }
                total += p.probability;
            }
            if (total > 0) {
                for (const p of this.players) p.probability /= total;
            }
        }
    }

    /**
     * Rejects a candidate explicitly (sets probability to 0)
     */
    rejectCandidate(playerName) {
        let newTotalProb = 0;
        for (const p of this.players) {
            if (p.player_name === playerName) {
                p.probability = 0;
            }
            newTotalProb += p.probability;
        }
        if (newTotalProb > 0) {
            for (const p of this.players) {
                p.probability /= newTotalProb;
            }
        }
    }

    /**
     * Pure Shannon Entropy-based question selection with weighted early-game preference.
     * Instead of hard bucket locks, we apply a mild penalty to specific/team questions
     * in the first few turns. After turn 2, team questions are fully eligible.
     * This allows the engine to ask "Did they play for CSK?" at turn 3 if it's the
     * best discriminator — fixing the failure to isolate unpopular players.
     */
    getNextQuestion() {
        const turn = this.askedQuestions.size;

        // Bucket early-preference penalty: only discourages higher buckets in very early turns
        // After turn 2, bucket 2 (team/style) questions are fully eligible
        // After turn 3, bucket 3 (accolades) questions are fully eligible
        const bucketPenalty = (bucket) => {
            if (bucket === 1) return 0;
            if (bucket === 2) return turn < 2 ? 0.15 : 0;
            if (bucket === 3) return turn < 3 ? 0.18 : 0;
            return 0;
        };

        let bestQuestion = null;
        let bestScore = Infinity;

        for (const attr of ATTRIBUTES) {
            if (this.askedQuestions.has(attr.id)) continue;

            let pYes = 0;
            for (const p of this.players) {
                if (this.playerHasAttribute(p, attr)) {
                    pYes += p.probability;
                }
            }

            // Skip non-discriminating questions
            if (pYes <= 0.01 || pYes >= 0.99) continue;

            // Shannon Entropy: best split is closest to 0.5
            const diff = Math.abs(pYes - 0.5);

            // Apply mild penalty for higher-bucket questions only in early turns
            const score = diff + bucketPenalty(attr.bucket);

            if (score < bestScore) {
                bestScore = score;
                bestQuestion = attr;
            }
        }

        return bestQuestion;
    }

    getTopCandidates(n = 5) {
        if (this.askedQuestions.size === 0) return [];
        
        return [...this.players]
            .sort((a, b) => b.probability - a.probability)
            .slice(0, n)
            .map(p => ({ 
                name: p.player_name, 
                probability: Math.round(p.probability * 100) 
            }));
    }
}
