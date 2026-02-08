// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DuckmonAgent
 * @dev On-chain storage for AI agent signals and predictions ($DUCKA)
 * @notice This contract stores trading signals, predictions, and market analyses
 *         from Duckmon AI agents on Monad blockchain
 */
contract DuckmonAgent {
    // ============ Structs ============
    
    struct Signal {
        address agent;         // Agent wallet address
        string signalType;     // "BUY", "SELL", "HOLD"
        uint256 confidence;    // 0-100
        uint256 price;         // Price at signal time (18 decimals)
        string reason;         // Analysis reason
        uint256 timestamp;     // Block timestamp
    }
    
    struct Prediction {
        address agent;         // Agent wallet address
        string direction;      // "UP", "DOWN", "SIDEWAYS"
        uint256 confidence;    // 0-100
        uint256 referencePrice;// Price at prediction time
        uint256 targetTime;    // When prediction expires
        bool verified;         // Has outcome been checked
        bool correct;          // Was prediction correct
        uint256 timestamp;     // When prediction was made
    }
    
    struct AgentStats {
        string name;           // Agent name
        uint256 totalSignals;  // Total signals posted
        uint256 totalPredictions; // Total predictions made
        uint256 correctPredictions; // Correct predictions
        uint256 lastActive;    // Last activity timestamp
        bool isRegistered;     // Is agent registered
    }
    
    // ============ State ============
    
    address public owner;
    
    // Agent data
    mapping(address => AgentStats) public agents;
    address[] public agentList;
    
    // Signals storage (latest 100 per type)
    Signal[] public tradingSignals;
    Prediction[] public predictions;
    
    // Latest signal per agent
    mapping(address => Signal) public latestSignal;
    mapping(address => Prediction) public latestPrediction;
    
    // ============ Events ============
    
    event AgentRegistered(address indexed agent, string name);
    event SignalPosted(address indexed agent, string signalType, uint256 confidence, uint256 price);
    event PredictionPosted(address indexed agent, string direction, uint256 confidence);
    event PredictionVerified(address indexed agent, bool correct);
    
    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
    }
    
    // ============ Agent Functions ============
    
    /**
     * @notice Register a new agent
     * @param name Agent's display name
     */
    function registerAgent(string memory name) external {
        require(!agents[msg.sender].isRegistered, "Already registered");
        
        agents[msg.sender] = AgentStats({
            name: name,
            totalSignals: 0,
            totalPredictions: 0,
            correctPredictions: 0,
            lastActive: block.timestamp,
            isRegistered: true
        });
        
        agentList.push(msg.sender);
        emit AgentRegistered(msg.sender, name);
    }
    
    /**
     * @notice Post a trading signal
     * @param signalType "BUY", "SELL", or "HOLD"
     * @param confidence 0-100 confidence score
     * @param price Current price (18 decimals)
     * @param reason Analysis reason
     */
    function postSignal(
        string memory signalType,
        uint256 confidence,
        uint256 price,
        string memory reason
    ) external {
        require(agents[msg.sender].isRegistered, "Agent not registered");
        require(confidence <= 100, "Confidence must be 0-100");
        
        Signal memory newSignal = Signal({
            agent: msg.sender,
            signalType: signalType,
            confidence: confidence,
            price: price,
            reason: reason,
            timestamp: block.timestamp
        });
        
        tradingSignals.push(newSignal);
        latestSignal[msg.sender] = newSignal;
        
        agents[msg.sender].totalSignals++;
        agents[msg.sender].lastActive = block.timestamp;
        
        emit SignalPosted(msg.sender, signalType, confidence, price);
    }
    
    /**
     * @notice Post a price prediction
     * @param direction "UP", "DOWN", or "SIDEWAYS"
     * @param confidence 0-100 confidence score
     * @param referencePrice Current price
     * @param targetTime When prediction should be verified
     */
    function postPrediction(
        string memory direction,
        uint256 confidence,
        uint256 referencePrice,
        uint256 targetTime
    ) external {
        require(agents[msg.sender].isRegistered, "Agent not registered");
        require(confidence <= 100, "Confidence must be 0-100");
        require(targetTime > block.timestamp, "Target must be in future");
        
        Prediction memory newPrediction = Prediction({
            agent: msg.sender,
            direction: direction,
            confidence: confidence,
            referencePrice: referencePrice,
            targetTime: targetTime,
            verified: false,
            correct: false,
            timestamp: block.timestamp
        });
        
        predictions.push(newPrediction);
        latestPrediction[msg.sender] = newPrediction;
        
        agents[msg.sender].totalPredictions++;
        agents[msg.sender].lastActive = block.timestamp;
        
        emit PredictionPosted(msg.sender, direction, confidence);
    }
    
    /**
     * @notice Verify a prediction outcome
     * @param predictionIndex Index of prediction to verify
     * @param actualPrice Price at verification time
     */
    function verifyPrediction(uint256 predictionIndex, uint256 actualPrice) external {
        require(predictionIndex < predictions.length, "Invalid index");
        Prediction storage pred = predictions[predictionIndex];
        require(!pred.verified, "Already verified");
        require(block.timestamp >= pred.targetTime, "Too early to verify");
        
        // Determine actual direction
        bool wentUp = actualPrice > pred.referencePrice;
        bool wentDown = actualPrice < pred.referencePrice;
        
        // Check if prediction was correct
        bool isCorrect = false;
        if (keccak256(bytes(pred.direction)) == keccak256(bytes("UP")) && wentUp) {
            isCorrect = true;
        } else if (keccak256(bytes(pred.direction)) == keccak256(bytes("DOWN")) && wentDown) {
            isCorrect = true;
        } else if (keccak256(bytes(pred.direction)) == keccak256(bytes("SIDEWAYS")) && !wentUp && !wentDown) {
            isCorrect = true;
        }
        
        pred.verified = true;
        pred.correct = isCorrect;
        
        if (isCorrect) {
            agents[pred.agent].correctPredictions++;
        }
        
        emit PredictionVerified(pred.agent, isCorrect);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get total number of registered agents
     */
    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }
    
    /**
     * @notice Get all registered agent addresses
     */
    function getAllAgents() external view returns (address[] memory) {
        return agentList;
    }
    
    /**
     * @notice Get recent signals (last n)
     */
    function getRecentSignals(uint256 count) external view returns (Signal[] memory) {
        uint256 total = tradingSignals.length;
        uint256 start = total > count ? total - count : 0;
        uint256 resultCount = total - start;
        
        Signal[] memory result = new Signal[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = tradingSignals[start + i];
        }
        return result;
    }
    
    /**
     * @notice Get recent predictions (last n)
     */
    function getRecentPredictions(uint256 count) external view returns (Prediction[] memory) {
        uint256 total = predictions.length;
        uint256 start = total > count ? total - count : 0;
        uint256 resultCount = total - start;
        
        Prediction[] memory result = new Prediction[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = predictions[start + i];
        }
        return result;
    }
    
    /**
     * @notice Get agent's accuracy percentage
     */
    function getAgentAccuracy(address agent) external view returns (uint256) {
        AgentStats memory stats = agents[agent];
        if (stats.totalPredictions == 0) return 0;
        return (stats.correctPredictions * 100) / stats.totalPredictions;
    }
    
    /**
     * @notice Get total signals count
     */
    function getTotalSignals() external view returns (uint256) {
        return tradingSignals.length;
    }
    
    /**
     * @notice Get total predictions count
     */
    function getTotalPredictions() external view returns (uint256) {
        return predictions.length;
    }
}
