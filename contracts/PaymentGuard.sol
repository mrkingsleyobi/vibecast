// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./TrustScoreNFT.sol";

/**
 * @title PaymentGuard
 * @dev Autonomous payment control contract with fraud prevention
 * Integrates with TrustScore NFT for real-time risk assessment
 */
contract PaymentGuard is Ownable, ReentrancyGuard, Pausable {
    // Reference to Trust Score NFT contract
    TrustScoreNFT public trustRegistry;

    // Minimum trust score required for transactions
    uint256 public minimumTrustScore = 500;

    // Maximum transaction amount without manual approval
    uint256 public autoApprovalLimit = 10000 ether;

    // Pending transactions that need approval
    struct PendingTransaction {
        address from;
        address to;
        uint256 amount;
        uint256 timestamp;
        bool approved;
        bool executed;
        string reason;
    }

    mapping(bytes32 => PendingTransaction) public pendingTransactions;

    // Events
    event TransactionApproved(
        bytes32 indexed txId,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    event TransactionBlocked(
        bytes32 indexed txId,
        address indexed from,
        address indexed to,
        uint256 amount,
        string reason
    );

    event TransactionExecuted(
        bytes32 indexed txId,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    event ManualApprovalRequested(
        bytes32 indexed txId,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    constructor(address _trustRegistry) Ownable(msg.sender) {
        require(_trustRegistry != address(0), "Invalid trust registry");
        trustRegistry = TrustScoreNFT(_trustRegistry);
    }

    /**
     * @dev Execute payment with trust verification
     */
    function executePayment(
        address to,
        uint256 amount
    ) external payable nonReentrant whenNotPaused returns (bytes32) {
        require(msg.value == amount, "Incorrect payment amount");
        require(to != address(0), "Invalid recipient");

        // Get trust score for sender
        (uint256 senderScore, uint8 senderRisk, bool senderBlacklisted,,) =
            trustRegistry.getTrustScore(msg.sender);

        // Get trust score for recipient
        (uint256 recipientScore, uint8 recipientRisk, bool recipientBlacklisted,,) =
            trustRegistry.getTrustScore(to);

        // Generate transaction ID
        bytes32 txId = keccak256(
            abi.encodePacked(msg.sender, to, amount, block.timestamp)
        );

        // Check if sender or recipient is blacklisted
        if (senderBlacklisted || recipientBlacklisted) {
            string memory reason = senderBlacklisted
                ? "Sender is blacklisted"
                : "Recipient is blacklisted";

            emit TransactionBlocked(txId, msg.sender, to, amount, reason);

            // Refund sender
            (bool refunded, ) = msg.sender.call{value: msg.value}("");
            require(refunded, "Refund failed");

            return txId;
        }

        // Check trust scores
        if (senderScore < minimumTrustScore) {
            pendingTransactions[txId] = PendingTransaction({
                from: msg.sender,
                to: to,
                amount: amount,
                timestamp: block.timestamp,
                approved: false,
                executed: false,
                reason: "Insufficient sender trust score"
            });

            emit ManualApprovalRequested(txId, msg.sender, to, amount);
            return txId;
        }

        if (recipientScore < minimumTrustScore && amount > autoApprovalLimit) {
            pendingTransactions[txId] = PendingTransaction({
                from: msg.sender,
                to: to,
                amount: amount,
                timestamp: block.timestamp,
                approved: false,
                executed: false,
                reason: "High-value transaction to low-trust recipient"
            });

            emit ManualApprovalRequested(txId, msg.sender, to, amount);
            return txId;
        }

        // Check risk levels
        if (senderRisk >= 2 || recipientRisk >= 2) {
            // High or critical risk
            pendingTransactions[txId] = PendingTransaction({
                from: msg.sender,
                to: to,
                amount: amount,
                timestamp: block.timestamp,
                approved: false,
                executed: false,
                reason: "High risk detected"
            });

            emit ManualApprovalRequested(txId, msg.sender, to, amount);
            return txId;
        }

        // All checks passed - execute transaction
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "Payment failed");

        emit TransactionExecuted(txId, msg.sender, to, amount);
        emit TransactionApproved(txId, msg.sender, to, amount);

        return txId;
    }

    /**
     * @dev Manually approve a pending transaction (owner only)
     */
    function approveTransaction(bytes32 txId) external onlyOwner {
        PendingTransaction storage txn = pendingTransactions[txId];
        require(txn.amount > 0, "Transaction not found");
        require(!txn.executed, "Already executed");
        require(!txn.approved, "Already approved");

        txn.approved = true;

        emit TransactionApproved(txId, txn.from, txn.to, txn.amount);
    }

    /**
     * @dev Execute approved pending transaction
     */
    function executePendingTransaction(
        bytes32 txId
    ) external nonReentrant onlyOwner {
        PendingTransaction storage txn = pendingTransactions[txId];
        require(txn.amount > 0, "Transaction not found");
        require(txn.approved, "Not approved");
        require(!txn.executed, "Already executed");

        txn.executed = true;

        // Execute payment
        (bool sent, ) = txn.to.call{value: txn.amount}("");
        require(sent, "Payment failed");

        emit TransactionExecuted(txId, txn.from, txn.to, txn.amount);
    }

    /**
     * @dev Reject and refund a pending transaction
     */
    function rejectTransaction(
        bytes32 txId,
        string memory reason
    ) external onlyOwner {
        PendingTransaction storage txn = pendingTransactions[txId];
        require(txn.amount > 0, "Transaction not found");
        require(!txn.executed, "Already executed");

        txn.executed = true;

        // Refund sender
        (bool refunded, ) = txn.from.call{value: txn.amount}("");
        require(refunded, "Refund failed");

        emit TransactionBlocked(txId, txn.from, txn.to, txn.amount, reason);
    }

    /**
     * @dev Update minimum trust score requirement
     */
    function setMinimumTrustScore(uint256 newMinimum) external onlyOwner {
        require(newMinimum <= 1000, "Score must be 0-1000");
        minimumTrustScore = newMinimum;
    }

    /**
     * @dev Update auto-approval limit
     */
    function setAutoApprovalLimit(uint256 newLimit) external onlyOwner {
        autoApprovalLimit = newLimit;
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
     * @dev Withdraw stuck funds (emergency only)
     */
    function emergencyWithdraw() external onlyOwner {
        (bool sent, ) = owner().call{value: address(this).balance}("");
        require(sent, "Withdrawal failed");
    }

    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {}
}
