Fibblash – Game Design & Implementation Specification
- Easy to understand without reading lengthy instructions.
- Entertaining regardless of trivia knowledge.
- Competitive without eliminating players.
- Suitable for friends playing together in person.
- Playable through a shared main screen and individual phones.
There are three question categories:
Category	Correct answer	Objective
Real	Yes	Fool other players
Creative	No	Write the funniest answer
Hybrid	Yes	Fool players and be funny

The question category is randomly selected throughout the game.
2. How players join
The game follows a Jackbox-style architecture.








androidcentral.com


Host experience:
1. Host opens the website.
2. Host creates a new game.
3. Server generates a unique room code.
4. Main screen displays the room code.
5. Host shares the code with friends.
6. Host starts the game once at least 3 players have joined.
Player experience:
1. Open the website on a phone, tablet, or computer.
2. Enter the room code.
3. Enter a display name.
4. Join the lobby.
5. Wait for the host to start.
Requirements:
- Minimum 3 players.
- Maximum 12 players.
- Unique player names within a room.
- Players should not need accounts.
- Each player receives a unique session/player identifier.
- Reconnection should be supported if a player refreshes or temporarily loses connection.
The host's screen and players' screens must be separate interfaces.

3. Gameplay rules
A. Real questions – Fibbage mode








geekscape.net


Objective: Convince other players that your fake answer is correct.

Gameplay:
1. Server selects a real trivia question with a verified answer.
2. All players receive the same question.
3. Each player submits one fake answer.
4. Server adds the actual correct answer.
5. All answers are shuffled.
6. Players select the answer they believe is correct.
7. Players cannot select their own submission.
8. Results are revealed and points awarded.
Example:

Question: What was bubble wrap originally invented for?
Answer	Type
Wallpaper	Correct
Packaging material	Fake
A children's toy	Fake
House insulation	Fake

The correct answer is revealed after voting.

Scoring:
- Correct guess: +1,000 points.
- Each player fooled by your fake answer: +500 points.
A player can earn both types of points in the same question.
B. Creative questions – Quiplash mode








quiplash.en.download.it


Objective: Write the funniest answer.

Gameplay:
1. Server selects a creative prompt.
2. Players are assigned into random groups.
3. Players in each group receive the same prompt.
4. Each player submits one answer.
5. Answers are displayed anonymously in head-to-head matchups.
6. Players vote for their favourite answer.
7. Results are revealed.
Example:

Prompt: What is the worst thing to hear from your doctor?
- "I Googled your symptoms."
- "Have you considered becoming a professional patient?"
- "Your insurance doesn't cover miracles."
Answers can be completely ridiculous. There are no restrictions on creativity beyond basic input safety.

For pairing:
- Even player counts: groups of two.
- Odd player counts: one group of three, with the remaining players paired.
- Players cannot vote for their own answer.
- In a three-player matchup, each author can vote for one of the other two answers.
Scoring:
- +250 points for each vote received.
- Optional +500 bonus if an answer receives every eligible vote.
C. Hybrid questions – Fibblash mode








jackboxgames.com


Objective: Fool other players AND write the funniest answer.

Gameplay:
1. Server selects a real question with a verified correct answer.
2. Everyone submits a fake answer.
3. Server adds the real answer.
4. All answers are shuffled and displayed.
5. First voting phase: players select the answer they believe is real.
6. Second voting phase: players select the funniest answer.
7. Results are revealed together.
Example:

Question: Which of these is an actual historical punishment?

Players submit:
- Being forced to wear a donkey mask.
- Having to sing the national anthem backwards.
- Being locked in a barrel.
- Having to marry a goat.
The game inserts the real historical answer.

Players vote twice:
- Which answer is real?
- Which answer is funniest?
Scoring:
Achievement	Points
Correct guess	+1,000
Fool someone	+500 per player
Receive a funny vote	+250 per vote

Players cannot vote for their own answers in either phase.

4. Scoring and leaderboard
There should be one global leaderboard throughout the game.

The leaderboard is updated after every question.

Requirements:
- Display player name, score and ranking.
- Highlight the player who earned the most points in the previous question.
- Show score changes, not just final totals.
- Handle ties without randomly selecting a winner.
- Maintain scores throughout the entire game.
The winner is the player with the highest total score when the game ends.

Important: Points should be cumulative. Do not reset scores between question types.
5. Random question selection
The server, not the client, determines which question appears.

Suggested initial distribution:
Question type	Probability
Real	40%
Creative	30%
Hybrid	30%

Rules:
- Randomly select question types according to these weights.
- Avoid repeating the same question within a game.
- Avoid more than two consecutive questions of the same type.
- Ensure all three question types appear in a normal-length game.
- Do not repeat questions that have already appeared in the current game.
Questions should have metadata:
type QuestionType = "REAL" | "CREATIVE" | "HYBRID";

interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  correctAnswer?: string;
  explanation?: string;
  category: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD";}


For real and hybrid questions, correctAnswer is mandatory.

For creative questions, it is not required.

6. Game timing
The target game duration is 15–20 minutes.

Suggested timers:
Phase	Duration
Lobby	Until host starts
Question display	5 seconds
Answer submission	30 seconds
Voting	20 seconds
Second hybrid vote	15 seconds
Results	8 seconds
Leaderboard	8 seconds

The game should support configurable timers later.

Important timer behavior:
- Players can submit before the timer expires.
- Submitted answers cannot be changed.
- Players who don't submit before the timer expires receive no answer for that question.
- Players who don't vote receive no voting points.
- The server controls all timers.
- All clients receive synchronized phase transitions.
7. Main screen and player interface
Main screen – Host / TV








playground.ru


Should display:
- Game logo and room code in lobby.
- Current question.
- Countdown timers.
- Submitted answers.
- Voting results.
- Correct answer and explanation.
- Player leaderboard.
- Final winner screen.


Player screen – Mobile








windowscentral.com


Should display:
- Player name and current score.
- Question and answer input.
- Character/word counter.
- Submission confirmation.
- Voting choices.
- Voting confirmation.
- Waiting screen while other players finish.
The mobile interface should be responsive and easy to operate with one hand.


The host should have controls to:
- Start the game.
- Start the next question if necessary.
- Skip a question.
- End the game.
- Remove a disconnected or disruptive player from the room.
Automatic progression should be the default, with manual host controls available as overrides.
8. Multiplayer technical implementation
This is an important part of the project. Fibblash needs real-time multiplayer synchronization.
Recommended architecture
If implementing with a modern TypeScript stack:
Layer	Suggested technology
Frontend	Next.js + React + TypeScript
Styling	Tailwind CSS
Backend	Node.js + TypeScript
Real-time communication	Socket.IO
Database	PostgreSQL
ORM	Prisma
Deployment	Vercel for frontend, persistent Node server for multiplayer

Socket.IO should handle real-time communication between the host, players and server.

The game should not depend on polling to synchronize gameplay.
Architecture diagram
#chatgpt-mermaid-_r_u9_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,Segoe UI,Helvetica,Apple Color Emoji,Arial,sans-serif,Segoe UI Emoji,Segoe UI Symbol;font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_u9_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_u9_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_u9_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-_r_u9_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-_r_u9_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-_r_u9_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-_r_u9_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-_r_u9_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-_r_u9_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-_r_u9_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-_r_u9_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_u9_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_u9_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,Segoe UI,Helvetica,Apple Color Emoji,Arial,sans-serif,Segoe UI Emoji,Segoe UI Symbol;font-size:16px;}#chatgpt-mermaid-_r_u9_ p{margin:0;}#chatgpt-mermaid-_r_u9_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,Segoe UI,Helvetica,Apple Color Emoji,Arial,sans-serif,Segoe UI Emoji,Segoe UI Symbol;color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_u9_ .cluster-label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_u9_ .cluster-label span{color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_u9_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-_r_u9_ .label text,#chatgpt-mermaid-_r_u9_ span{fill:rgb(237, 237, 237);color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_u9_ .node rect,#chatgpt-mermaid-_r_u9_ .node circle,#chatgpt-mermaid-_r_u9_ .node ellipse,#chatgpt-mermaid-_r_u9_ .node polygon,#chatgpt-mermaid-_r_u9_ .node path{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);stroke-width:1px;}#chatgpt-mermaid-_r_u9_ .rough-node .label text,#chatgpt-mermaid-_r_u9_ .node .label text,#chatgpt-mermaid-_r_u9_ .image-shape .label,#chatgpt-mermaid-_r_u9_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-_r_u9_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-_r_u9_ .rough-node .label,#chatgpt-mermaid-_r_u9_ .node .label,#chatgpt-mermaid-_r_u9_ .image-shape .label,#chatgpt-mermaid-_r_u9_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-_r_u9_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-_r_u9_ .root .anchor path{fill:rgb(175, 175, 175)!important;stroke-width:0;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_u9_ .arrowheadPath{fill:rgb(175, 175, 175);}#chatgpt-mermaid-_r_u9_ .edgePath .path{stroke:rgb(175, 175, 175);stroke-width:1px;}#chatgpt-mermaid-_r_u9_ .flowchart-link{stroke:rgb(175, 175, 175);fill:none;}#chatgpt-mermaid-_r_u9_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-_r_u9_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-_r_u9_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-_r_u9_ .labelBkg{background-color:rgba(0, 0, 0, 0.5);}#chatgpt-mermaid-_r_u9_ .cluster rect{fill:rgb(48, 48, 48);stroke:rgba(255, 255, 255, 0.15);stroke-width:1px;}#chatgpt-mermaid-_r_u9_ .cluster text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_u9_ .cluster span{color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_u9_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,Segoe UI,Helvetica,Apple Color Emoji,Arial,sans-serif,Segoe UI Emoji,Segoe UI Symbol;font-size:12px;background:rgb(48, 48, 48);border:1px solid rgba(255, 255, 255, 0.15);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-_r_u9_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_u9_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-_r_u9_ .icon-shape,#chatgpt-mermaid-_r_u9_ .image-shape{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-_r_u9_ .icon-shape p,#chatgpt-mermaid-_r_u9_ .image-shape p{background-color:rgb(0, 0, 0);padding:2px;}#chatgpt-mermaid-_r_u9_ .icon-shape .label rect,#chatgpt-mermaid-_r_u9_ .image-shape .label rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-_r_u9_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-_r_u9_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-_r_u9_ .node .neo-node{stroke:rgb(31, 78, 148);}#chatgpt-mermaid-_r_u9_ [data-look="neo"].node rect,#chatgpt-mermaid-_r_u9_ [data-look="neo"].cluster rect,#chatgpt-mermaid-_r_u9_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-_r_u9_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_u9_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-_r_u9_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-_r_u9_-gradient);stroke-width:1px;}#chatgpt-mermaid-_r_u9_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_u9_ [data-look="neo"].node .neo-line path{stroke:rgb(31, 78, 148);filter:none;}#chatgpt-mermaid-_r_u9_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-_r_u9_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_u9_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-_r_u9_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-_r_u9_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_u9_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-_r_u9_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_u9_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(153, 206, 255);}#chatgpt-mermaid-_r_u9_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(153, 206, 255);}#chatgpt-mermaid-_r_u9_ .node tspan[font-weight="normal"],#chatgpt-mermaid-_r_u9_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-_r_u9_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-width:1px;}#chatgpt-mermaid-_r_u9_ .node rect,#chatgpt-mermaid-_r_u9_ .node circle,#chatgpt-mermaid-_r_u9_ .node ellipse,#chatgpt-mermaid-_r_u9_ .node polygon,#chatgpt-mermaid-_r_u9_ .node path{fill:rgb(0, 40, 77);stroke:rgba(255, 255, 255, 0.1);stroke-width:1px;}#chatgpt-mermaid-_r_u9_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-_r_u9_ .mermaid-decision .label-container{fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-dasharray:2px,2px;}#chatgpt-mermaid-_r_u9_ .edgePaths .flowchart-link{stroke:rgb(175, 175, 175);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-_r_u9_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_u9_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,Segoe UI,Helvetica,Apple Color Emoji,Arial,sans-serif,Segoe UI Emoji,Segoe UI Symbol;}Host BrowserGame ServerPlayer 1 PhonePlayer 2 PhonePlayer N PhonePostgreSQLQuestion DatabaseSocket.IOSocket.IOSocket.IOSocket.IO





Server responsibilities
The server must be authoritative.

It should:
- Create and manage rooms.
- Generate room codes.
- Manage player sessions.
- Track player connections.
- Distribute questions.
- Collect answers.
- Randomize answer ordering.
- Manage voting.
- Validate votes.
- Calculate scores.
- Control timers and game phases.
- Broadcast leaderboard updates.
- Determine the final winner.
Never trust the frontend to calculate scores or determine the correct answer.

All scoring and validation must happen server-side.
Suggested game state machine
#chatgpt-mermaid-_r_uj_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,Segoe UI,Helvetica,Apple Color Emoji,Arial,sans-serif,Segoe UI Emoji,Segoe UI Symbol;font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_uj_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_uj_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-_r_uj_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-_r_uj_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-_r_uj_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-_r_uj_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-_r_uj_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-_r_uj_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-_r_uj_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-_r_uj_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-_r_uj_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uj_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uj_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,Segoe UI,Helvetica,Apple Color Emoji,Arial,sans-serif,Segoe UI Emoji,Segoe UI Symbol;font-size:16px;}#chatgpt-mermaid-_r_uj_ p{margin:0;}#chatgpt-mermaid-_r_uj_ defs [id$="-barbEnd"]{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uj_ g.stateGroup text{fill:rgb(31, 78, 148);stroke:none;font-size:10px;}#chatgpt-mermaid-_r_uj_ g.stateGroup text{fill:rgb(237, 237, 237);stroke:none;font-size:10px;}#chatgpt-mermaid-_r_uj_ g.stateGroup .state-title{font-weight:bolder;fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_uj_ g.stateGroup rect{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);}#chatgpt-mermaid-_r_uj_ g.stateGroup line{stroke:rgb(175, 175, 175);stroke-width:1;}#chatgpt-mermaid-_r_uj_ .transition{stroke:rgb(175, 175, 175);stroke-width:1;fill:none;}#chatgpt-mermaid-_r_uj_ .stateGroup .composit{fill:transparent;border-bottom:1px;}#chatgpt-mermaid-_r_uj_ .stateGroup .alt-composit{fill:#e0e0e0;border-bottom:1px;}#chatgpt-mermaid-_r_uj_ .state-note{stroke:rgb(58, 132, 63);fill:rgb(48, 48, 48);}#chatgpt-mermaid-_r_uj_ .state-note text{fill:rgb(237, 237, 237);stroke:none;font-size:10px;}#chatgpt-mermaid-_r_uj_ .stateLabel .box{stroke:none;stroke-width:0;fill:rgb(9, 23, 44);opacity:0.5;}#chatgpt-mermaid-_r_uj_ .edgeLabel .label rect{fill:rgb(9, 23, 44);opacity:0.5;}#chatgpt-mermaid-_r_uj_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-_r_uj_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-_r_uj_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-_r_uj_ .edgeLabel .label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_uj_ .label div .edgeLabel{color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_uj_ .stateLabel text{fill:rgb(237, 237, 237);font-size:10px;font-weight:bold;}#chatgpt-mermaid-_r_uj_ .node circle.state-start{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uj_ .node .fork-join{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uj_ .node circle.state-end{fill:rgb(31, 78, 148);stroke:transparent;stroke-width:1.5;}#chatgpt-mermaid-_r_uj_ .end-state-inner{fill:transparent;stroke-width:1.5;}#chatgpt-mermaid-_r_uj_ .node rect{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);stroke-width:1px;}#chatgpt-mermaid-_r_uj_ .node polygon{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);stroke-width:1px;}#chatgpt-mermaid-_r_uj_ [id$="-barbEnd"]{fill:rgb(175, 175, 175);}#chatgpt-mermaid-_r_uj_ .statediagram-cluster rect{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);stroke-width:1px;}#chatgpt-mermaid-_r_uj_ .cluster-label,#chatgpt-mermaid-_r_uj_ .nodeLabel{color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_uj_ .statediagram-cluster rect.outer{rx:5px;ry:5px;}#chatgpt-mermaid-_r_uj_ .statediagram-state .divider{stroke:rgb(31, 78, 148);}#chatgpt-mermaid-_r_uj_ .statediagram-state .title-state{rx:5px;ry:5px;}#chatgpt-mermaid-_r_uj_ .statediagram-cluster.statediagram-cluster .inner{fill:transparent;}#chatgpt-mermaid-_r_uj_ .statediagram-cluster.statediagram-cluster-alt .inner{fill:rgb(48, 48, 48);}#chatgpt-mermaid-_r_uj_ .statediagram-cluster .inner{rx:0;ry:0;}#chatgpt-mermaid-_r_uj_ .statediagram-state rect.basic{rx:5px;ry:5px;}#chatgpt-mermaid-_r_uj_ .statediagram-state rect.divider{stroke-dasharray:10,10;fill:rgb(48, 48, 48);}#chatgpt-mermaid-_r_uj_ .note-edge{stroke-dasharray:5;}#chatgpt-mermaid-_r_uj_ .statediagram-note rect{fill:rgb(48, 48, 48);stroke:rgb(58, 132, 63);stroke-width:1px;rx:0;ry:0;}#chatgpt-mermaid-_r_uj_ .statediagram-note rect{fill:rgb(48, 48, 48);stroke:rgb(58, 132, 63);stroke-width:1px;rx:0;ry:0;}#chatgpt-mermaid-_r_uj_ .statediagram-note text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_uj_ .statediagram-note .nodeLabel{color:rgb(237, 237, 237);}#chatgpt-mermaid-_r_uj_ .statediagram .edgeLabel{color:red;}#chatgpt-mermaid-_r_uj_ [id$="-dependencyStart"],#chatgpt-mermaid-_r_uj_ [id$="-dependencyEnd"]{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);stroke-width:1;}#chatgpt-mermaid-_r_uj_ .statediagramTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-_r_uj_ [data-look="neo"].statediagram-cluster rect{fill:rgb(9, 23, 44);stroke:url(#chatgpt-mermaid-_r_uj_-gradient);stroke-width:1;}#chatgpt-mermaid-_r_uj_ [data-look="neo"].statediagram-cluster rect.outer{rx:5px;ry:5px;filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uj_ .node .neo-node{stroke:rgb(31, 78, 148);}#chatgpt-mermaid-_r_uj_ [data-look="neo"].node rect,#chatgpt-mermaid-_r_uj_ [data-look="neo"].cluster rect,#chatgpt-mermaid-_r_uj_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-_r_uj_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uj_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-_r_uj_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-_r_uj_-gradient);stroke-width:1px;}#chatgpt-mermaid-_r_uj_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uj_ [data-look="neo"].node .neo-line path{stroke:rgb(31, 78, 148);filter:none;}#chatgpt-mermaid-_r_uj_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-_r_uj_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uj_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-_r_uj_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-_r_uj_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uj_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-_r_uj_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-_r_uj_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,Segoe UI,Helvetica,Apple Color Emoji,Arial,sans-serif,Segoe UI Emoji,Segoe UI Symbol;}LOBBYQUESTIONANSWERINGVOTINGRESULTSLEADERBOARDFINISHED





Hybrid questions have an additional voting phase:

ANSWERING → REAL_VOTING → FUNNY_VOTING → RESULTS

The server should reject events that are invalid for the current phase.
Suggested database entities
Player {
  id: string;
  roomId: string;
  name: string;
  score: number;
  connected: boolean;
}

Room {
  id: string;
  code: string;
  hostId: string;
  status: GameStatus;
  currentQuestionId?: string;
}

Game {
  id: string;
  roomId: string;
  status: GameStatus;
  currentQuestionIndex: number;
}

Question {
  id: string;
  type: QuestionType;
  prompt: string;
  correctAnswer?: string;
  explanation?: string;
  category: string;
}

Submission {
  id: string;
  questionId: string;
  playerId: string;
  answer: string;
}

Vote {
  id: string;
  questionId: string;
  voterId: string;
  submissionId?: string;
  voteType: "REAL" | "FUNNY";
  selectedCorrectAnswer: boolean;
}

GameScore {
  id: string;
  gameId: string;
  playerId: string;
  pointsEarned: number;
}


These are suggested logical entities; they can be combined or normalized differently in the actual database schema.
Important Socket.IO events
Event	Direction	Purpose
room:create	Host → Server	Create game room
room:join	Player → Server	Join using room code
room:playerJoined	Server → Room	Notify players
game:start	Host → Server	Start game
question:show	Server → Room	Display question
answer:submit	Player → Server	Submit answer
voting:start	Server → Room	Start voting
vote:submit	Player → Server	Submit vote
results:show	Server → Room	Display results
leaderboard:update	Server → Room	Update standings
game:finish	Server → Room	Announce winner

All events should be validated against room membership, player identity, game phase and submission status.

9. Question database and content management
The quality of the questions will determine how entertaining Fibblash becomes.

I recommend separating questions from the game engine.

For the initial release, use a curated question database.

Suggested categories:
- History
- Geography
- Science
- Animals
- Food
- Technology
- Movies and TV
- Music
- Sports
- Weird facts
- Everyday life
- Completely ridiculous prompts
For real and hybrid questions, each entry must have:
- A verified correct answer.
- A short explanation.
- A reliable source/reference.
- An unambiguous question.
- An acceptable difficulty level.
For creative questions, each entry only needs the prompt and category.

Avoid questions with multiple defensible correct answers, unless the accepted answers are explicitly configured.
Question management
I'd recommend creating an admin-only question management page eventually, where you can:
- Add questions.
- Edit questions.
- Delete questions.
- Choose question types.
- Assign categories.
- Mark questions as active/inactive.
- Review sources and correct answers.
Do not hardcode questions directly into React components.

10. Edge cases and game integrity
Claude should account for these from the beginning.
Situation	Expected behavior
Player disconnects	Preserve their session and allow reconnection.
Player refreshes	Restore their current game state.
Duplicate name	Ask for a different name or append a suffix.
Duplicate answer	Handle without confusing the correct answer with a fake answer.
Player submits twice	Accept only the first valid submission.
Player votes twice	Accept only the first valid vote.
Player doesn't answer	Exclude them from that question's submissions.
Player doesn't vote	No voting points.
Host disconnects	Allow host reconnection; provide a host transfer fallback.
All players finish early	Advance immediately after a short reveal delay.
Invalid room code	Show a clear error.
Host skips question	Close the current question and move to the next phase safely.

Additional security:
- Do not expose the correct answer to player clients before results.
- Do not expose player identities alongside anonymous answers before voting closes.
- Prevent users from submitting votes for nonexistent answers.
- Prevent players from joining after the game starts unless explicitly allowed.
- Rate-limit room creation and join attempts.
- Validate and sanitize player-generated text.
- Escape HTML and prevent XSS.
- Enforce server-side timers and scoring.

11. Testing requirements
The game needs automated tests, not just manual testing.

I'd prioritize:

Unit tests
- Real question scoring.
- Creative question scoring.
- Hybrid question scoring.
- Duplicate answer handling.
- Vote validation.
- Random question selection.
- Tie handling.
- Leaderboard calculation.
Multiplayer integration tests
- Three players joining.
- Twelve players joining.
- Multiple rooms running simultaneously.
- Answer submissions from different players.
- Voting synchronization.
- Players disconnecting and reconnecting.
- Host disconnecting.
- Invalid events and duplicate submissions.
End-to-end tests
- Create room.
- Join room.
- Start game.
- Play all three question types.
- Complete all questions.
- Display leaderboard.
- Announce winner.
A game should not be considered complete until a full multiplayer session can be played from beginning to end.

12. Development milestones
I recommend implementing this in stages instead of asking Claude to build everything simultaneously.
Milestone	Deliverable
1. Foundation	Lobby, room codes, joining, player sessions
2. Real questions	Answer submission, fake answers, voting, scoring
3. Creative questions	Prompt pairing, voting and scoring
4. Hybrid questions	Two voting phases and combined scoring
5. Game engine	Random selection, timers, leaderboard, game completion
6. UI/UX	Animations, responsive screens, sound effects
7. Reliability	Reconnection, validation and error handling
8. Testing	Automated tests and complete multiplayer verification

I'd build a functional game before spending time on fancy animations.

13. What is included in the first playable version?
MVP scope
- [x] 3–12 players.
- [x] Room-code-based multiplayer.
- [x] Host and player interfaces.
- [x] Real trivia questions.
- [x] Creative prompts.
- [x] Hybrid questions.
- [x] Open-ended player submissions.
- [x] Anonymous answers.
- [x] Randomized question selection.
- [x] Voting and scoring.
- [x] Combined leaderboard after every question.
- [x] 15–20 minute target duration.
- [x] Final winner screen.
- [x] Reconnection support.
- [x] Automated tests.
Features such as spectator mode, custom question packs, audience voting, public matchmaking and advanced statistics can come later.

14. Instructions for Claude
The most important implementation instruction is to avoid building this as a collection of disconnected screens.

The game needs a centralized, server-authoritative game engine. Each room should have its own isolated game state, and all players must see synchronized transitions.

The following is the instruction I'd give Claude:
Claude Implementation Instructions – Fibblash
Build Fibblash as a complete, browser-based multiplayer party game.

Use the game design specification above as the source of truth.
Implementation priorities
1. Start by inspecting the existing repository and understanding its architecture before modifying anything.
2. Propose a concise implementation plan.
3. Build the backend game engine and room management first.
4. Implement real-time multiplayer communication.
5. Implement each question type independently.
6. Implement centralized scoring and leaderboard calculations.
7. Build the host and player interfaces.
8. Add automated tests for the complete game flow.
Non-negotiable requirements
- Support 3–12 players.
- Support multiple simultaneous rooms.
- Use server-authoritative game state.
- Use real-time communication.
- Never expose correct answers before voting closes.
- Never allow players to vote for their own answers.
- Prevent duplicate submissions and votes.
- Support all three question types.
- Update the combined leaderboard after every question.
- Preserve player sessions through temporary disconnections.
- Ensure the entire game can be completed without manual database intervention.
Architecture requirements
Keep game logic separate from UI components.

Implement dedicated modules/services for:
- Room management.
- Player management.
- Game state management.
- Question selection.
- Answer submissions.
- Voting.
- Scoring.
- Leaderboard.
- Timers.
- Reconnection.
Use TypeScript types and validation throughout.
Development approach
Do not attempt to implement every feature in one giant change.

Implement one milestone at a time. After each milestone:
1. Run the relevant automated tests.
2. Fix any regressions.
3. Verify the feature manually where necessary.
4. Update the project documentation.
5. Move to the next milestone.
Do not use mock gameplay or fake scoring in the final implementation.

Use actual multiplayer connections and persistent server-side game state.
Completion criteria
The project is complete when 3–12 real browser clients can join one room, play all three question types, submit answers, vote, receive correctly calculated points, view synchronized leaderboards, and finish a complete game.

Prioritize a reliable and fun playable game over unnecessary complexity.