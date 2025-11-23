// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title TrustScoreNFT
 * @dev ERC1155 NFT for storing decentralized trust scores
 * Enables privacy-preserving trust verification on-chain
 */
contract TrustScoreNFT is ERC1155, Ownable, Pausable {
    // Trust score data structure
    struct TrustData {
        uint256 score;           // 0-1000 trust score
        uint256 lastUpdated;     // timestamp
        uint256 transactionCount; // number of transactions analyzed
        bytes32 merkleRoot;      // privacy-preserving proof
        bool isBlacklisted;      // fraud flag
        uint8 riskLevel;         // 0=low, 1=medium, 2=high, 3=critical
    }

    // Mapping from address to trust data
    mapping(address => TrustData) public trustScores;

    // Mapping of authorized AI agents that can update scores
    mapping(address => bool) public authorizedAgents;

    // Events
    event TrustScoreUpdated(
        address indexed entity,
        uint256 newScore,
        uint8 riskLevel,
        uint256 timestamp
    );

    event EntityBlacklisted(
        address indexed entity,
        string reason,
        uint256 timestamp
    );

    event EntityWhitelisted(
        address indexed entity,
        uint256 timestamp
    );

    event AgentAuthorized(
        address indexed agent,
        uint256 timestamp
    );

    event AgentRevoked(
        address indexed agent,
        uint256 timestamp
    );

    // Minimum trust score for transactions
    uint256 public minimumTrustScore = 300;

    constructor() ERC1155("https://trustswarm.ai/api/metadata/{id}.json") Ownable(msg.sender) {
        // Initialize contract
        authorizedAgents[msg.sender] = true;
    }

    /**
     * @dev Modifier to restrict function access to authorized AI agents
     */
    modifier onlyAuthorizedAgent() {
        require(authorizedAgents[msg.sender], "Not authorized agent");
        _;
    }

    /**
     * @dev Authorize an AI agent to update trust scores
     */
    function authorizeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = true;
        emit AgentAuthorized(agent, block.timestamp);
    }

    /**
     * @dev Revoke agent authorization
     */
    function revokeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = false;
        emit AgentRevoked(agent, block.timestamp);
    }

    /**
     * @dev Update trust score for an entity
     * Can only be called by authorized AI agents
     */
    function updateTrustScore(
        address entity,
        uint256 newScore,
        uint8 riskLevel,
        bytes32 merkleRoot
    ) external onlyAuthorizedAgent whenNotPaused {
        require(newScore <= 1000, "Score must be 0-1000");
        require(riskLevel <= 3, "Risk level must be 0-3");

        TrustData storage data = trustScores[entity];
        data.score = newScore;
        data.lastUpdated = block.timestamp;
        data.transactionCount += 1;
        data.merkleRoot = merkleRoot;
        data.riskLevel = riskLevel;

        // Mint or update NFT
        _mint(entity, 1, 1, "");

        emit TrustScoreUpdated(entity, newScore, riskLevel, block.timestamp);
    }

    /**
     * @dev Blacklist an entity (mark as fraud)
     */
    function blacklistEntity(
        address entity,
        string memory reason
    ) external onlyAuthorizedAgent {
        trustScores[entity].isBlacklisted = true;
        trustScores[entity].score = 0;
        trustScores[entity].riskLevel = 3; // Critical risk

        emit EntityBlacklisted(entity, reason, block.timestamp);
    }

    /**
     * @dev Remove entity from blacklist
     */
    function whitelistEntity(address entity) external onlyOwner {
        trustScores[entity].isBlacklisted = false;

        emit EntityWhitelisted(entity, block.timestamp);
    }

    /**
     * @dev Get trust score for an entity
     */
    function getTrustScore(address entity) external view returns (
        uint256 score,
        uint8 riskLevel,
        bool isBlacklisted,
        uint256 lastUpdated,
        uint256 transactionCount
    ) {
        TrustData memory data = trustScores[entity];
        return (
            data.score,
            data.riskLevel,
            data.isBlacklisted,
            data.lastUpdated,
            data.transactionCount
        );
    }

    /**
     * @dev Check if entity meets minimum trust requirements
     */
    function isTrusted(address entity) external view returns (bool) {
        TrustData memory data = trustScores[entity];
        return !data.isBlacklisted && data.score >= minimumTrustScore;
    }

    /**
     * @dev Verify trust proof (ZK proof verification)
     * Placeholder for future ZK proof implementation
     */
    function verifyTrustProof(
        address entity,
        bytes32 proof
    ) external view returns (bool) {
        TrustData memory data = trustScores[entity];
        return data.merkleRoot == proof;
    }

    /**
     * @dev Update minimum trust score requirement
     */
    function setMinimumTrustScore(uint256 newMinimum) external onlyOwner {
        require(newMinimum <= 1000, "Score must be 0-1000");
        minimumTrustScore = newMinimum;
    }

    /**
     * @dev Pause contract in emergency
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Set base URI for metadata
     */
    function setURI(string memory newuri) external onlyOwner {
        _setURI(newuri);
    }

    /**
     * @dev Batch update trust scores for efficiency
     */
    function batchUpdateTrustScores(
        address[] calldata entities,
        uint256[] calldata scores,
        uint8[] calldata riskLevels,
        bytes32[] calldata merkleRoots
    ) external onlyAuthorizedAgent whenNotPaused {
        require(
            entities.length == scores.length &&
            scores.length == riskLevels.length &&
            riskLevels.length == merkleRoots.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < entities.length; i++) {
            require(scores[i] <= 1000, "Score must be 0-1000");
            require(riskLevels[i] <= 3, "Risk level must be 0-3");

            TrustData storage data = trustScores[entities[i]];
            data.score = scores[i];
            data.lastUpdated = block.timestamp;
            data.transactionCount += 1;
            data.merkleRoot = merkleRoots[i];
            data.riskLevel = riskLevels[i];

            _mint(entities[i], 1, 1, "");

            emit TrustScoreUpdated(
                entities[i],
                scores[i],
                riskLevels[i],
                block.timestamp
            );
        }
    }
}
