"use strict";

const utils = require('./utils.js');

module.exports = class MerkleTree {

  /**
   * Creates a Merkle tree from ordered transaction ids.
   *
   * @param {Array<String>} [leaves=[]] - Transaction ids in block order.
   */
  constructor(leaves = []) {
    this.leaves = [...leaves];
    this.levels = this.constructor.buildLevels(this.leaves);
  }

  /**
   * Returns the Merkle root for the current tree, or null for an empty tree.
   *
   * @returns {String|null}
   */
  get root() {
    if (this.levels.length === 0) return null;
    return this.levels[this.levels.length - 1][0];
  }

  /**
   * Rebuilds the tree after appending a new leaf.
   *
   * @param {String} leaf - Transaction id to add to the tree.
   * @returns {String} - Added transaction id.
   */
  addLeaf(leaf) {
    this.leaves.push(leaf);
    this.levels = this.constructor.buildLevels(this.leaves);
    return leaf;
  }

  /**
   * Returns a copy of the leaves for external inspection.
   *
   * @returns {Array<String>}
   */
  getLeaves() {
    return [...this.leaves];
  }

  /**
   * Returns a copy of the tree levels from leaves to root.
   *
   * @returns {Array<Array<String>>}
   */
  getLevels() {
    return this.levels.map((level) => [...level]);
  }

  /**
   * Returns a Merkle inclusion proof for the specified leaf.
   *
   * @param {String} leaf - Transaction id already in the tree.
   * @returns {Array<Object>|null} - Ordered sibling path or null if absent.
   */
  getProof(leaf) {
    if (this.leaves.length === 0) return null;

    let index = this.leaves.indexOf(leaf);
    if (index === -1) return null;

    let proof = [];
    for (let depth = 0; depth < this.levels.length - 1; depth++) {
      let level = this.levels[depth];
      let isRightNode = index % 2 === 1;
      let siblingIndex = isRightNode ? index - 1 : index + 1;
      let sibling = siblingIndex < level.length ? level[siblingIndex] : level[index];

      proof.push({
        position: isRightNode ? 'left' : 'right',
        data: sibling,
      });

      index = Math.floor(index / 2);
    }

    return proof;
  }

  /**
   * Verifies a Merkle inclusion proof.
   *
   * @param {String} leaf - Transaction id.
   * @param {Array<Object>} proof - Sibling path produced by getProof.
   * @param {String} root - Expected Merkle root.
   * @returns {Boolean}
   */
  static verifyProof(leaf, proof, root) {
    if (root === null) return proof === null || proof.length === 0;
    if (!Array.isArray(proof)) return false;

    let hash = leaf;
    for (let { position, data } of proof) {
      if (position === 'left') {
        hash = this.hashPair(data, hash);
      } else if (position === 'right') {
        hash = this.hashPair(hash, data);
      } else {
        return false;
      }
    }

    return hash === root;
  }

  /**
   * Builds tree levels from hashed leaves. Each level duplicates the final node
   * when needed so parent hashing remains well-defined for odd-sized levels.
   *
   * @param {Array<String>} leaves - Hashed leaves.
   * @returns {Array<Array<String>>}
   */
  static buildLevels(leaves) {
    if (!Array.isArray(leaves) || leaves.length === 0) return [];

    let levels = [[...leaves]];
    while (levels[levels.length - 1].length > 1) {
      let currentLevel = levels[levels.length - 1];
      let nextLevel = [];

      for (let index = 0; index < currentLevel.length; index += 2) {
        let left = currentLevel[index];
        let right = currentLevel[index + 1] || left;
        nextLevel.push(this.hashPair(left, right));
      }

      levels.push(nextLevel);
    }

    return levels;
  }

  /**
   * Hashes a pair of child nodes into a parent node.
   *
   * @param {String} left
   * @param {String} right
   * @returns {String}
   */
  static hashPair(left, right) {
    return utils.hash(`${left}${right}`);
  }
};
