"use strict";

/**
 * Merkle tree integration checks.
 * Run: node tests/merkleTree.js
 */

const Block = require("../block.js");
const Blockchain = require("../blockchain.js");
const MerkleTree = require("../merkletree.js");
const Transaction = require("../transaction.js");
const utils = require("../utils.js");

function assertPass(name, cond) {
  if (cond) {
    console.log(`PASS: ${name}`);
  } else {
    console.log(`FAIL: ${name}`);
    process.exitCode = 1;
  }
}

function makeNet() {
  return {
    register() {},
    broadcast() {},
    sendMessage() {},
  };
}

const txIDs = ["tx-a", "tx-b", "tx-c"].map((label) => utils.hash(label));
const tree = new MerkleTree(txIDs);
const proof = tree.getProof(txIDs[1]);

assertPass(
  "merkle root is computed for ordered transaction ids",
  typeof tree.root === "string" && tree.root.length > 0,
);

assertPass(
  "proof verifies for an included transaction id",
  MerkleTree.verifyProof(txIDs[1], proof, tree.root),
);

assertPass(
  "proof fails for a different transaction id",
  !MerkleTree.verifyProof(txIDs[0], proof, tree.root),
);

Blockchain.createInstance({
  blockClass: Block,
  transactionClass: Transaction,
  net: makeNet(),
  clients: [],
});

const prevBlock = new Block("miner");
prevBlock.balances = new Map();

const block = new Block("miner", prevBlock);
for (let txID of txIDs) {
  block.transactions.set(txID, { id: txID });
}
block.updateMerkleRoot();

assertPass(
  "block merkle root matches a tree built from transaction ids",
  block.merkleRoot === tree.root,
);

const serialized = JSON.parse(block.serialize());
const roundTrip = Blockchain.deserializeBlock(serialized);

assertPass(
  "serialized block preserves merkle root",
  roundTrip.merkleRoot === block.merkleRoot,
);

assertPass(
  "deserialized block validates its merkle root",
  roundTrip.hasValidMerkleRoot(),
);
