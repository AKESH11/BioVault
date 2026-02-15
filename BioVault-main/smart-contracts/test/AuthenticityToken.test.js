const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("AuthenticityToken Contract", function () {
  let authenticityToken;
  let owner, user1, user2;

  const sampleMediaHash = "media_hash_abc123";
  const sampleBioSignature = "BPM:72|SIG:abc123";
  const sampleHardwareID = "PRNU:device123";
  const sampleIPFSHash = "QmTest123";

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const AuthenticityToken = await ethers.getContractFactory("AuthenticityToken");
    authenticityToken = await AuthenticityToken.deploy();
    await authenticityToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await authenticityToken.name()).to.equal("Bio-Vault Authenticity");
      expect(await authenticityToken.symbol()).to.equal("BVAUTH");
    });

    it("Should set the correct owner", async function () {
      expect(await authenticityToken.owner()).to.equal(owner.address);
    });
  });

  describe("Minting", function () {
    it("Should mint a soulbound token with full anchor data", async function () {
      await expect(
        authenticityToken.connect(owner).mint(
          user1.address,
          sampleMediaHash,
          sampleBioSignature,
          sampleHardwareID,
          sampleIPFSHash
        )
      )
        .to.emit(authenticityToken, "AuthenticityMinted")
        .withArgs(
          1, // tokenId
          sampleMediaHash,
          user1.address,
          sampleBioSignature,
          sampleHardwareID,
          anyValue // timestamp
        );
    });

    it("Should store correct anchor data", async function () {
      await authenticityToken.connect(owner).mint(
        user1.address,
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        sampleIPFSHash
      );

      const anchor = await authenticityToken.tokenAnchors(1);
      expect(anchor.mediaHash).to.equal(sampleMediaHash);
      expect(anchor.bioSignature).to.equal(sampleBioSignature);
      expect(anchor.hardwareID).to.equal(sampleHardwareID);
      expect(anchor.ipfsHash).to.equal(sampleIPFSHash);
      expect(anchor.timestamp).to.be.gt(0);
    });

    it("Should assign token to the correct owner", async function () {
      await authenticityToken.connect(owner).mint(
        user1.address,
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        sampleIPFSHash
      );

      expect(await authenticityToken.ownerOf(1)).to.equal(user1.address);
      expect(await authenticityToken.balanceOf(user1.address)).to.equal(1);
    });

    it("Should increment token IDs correctly", async function () {
      await authenticityToken.connect(owner).mint(
        user1.address, "hash1", sampleBioSignature, sampleHardwareID, sampleIPFSHash
      );
      await authenticityToken.connect(owner).mint(
        user2.address, "hash2", sampleBioSignature, sampleHardwareID, sampleIPFSHash
      );

      expect(await authenticityToken.ownerOf(1)).to.equal(user1.address);
      expect(await authenticityToken.ownerOf(2)).to.equal(user2.address);
    });

    it("Should map media hash to token ID", async function () {
      await authenticityToken.connect(owner).mint(
        user1.address,
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        sampleIPFSHash
      );

      const tokenId = await authenticityToken.getTokenByMediaHash(sampleMediaHash);
      expect(tokenId).to.equal(1);
    });

    it("Should reject empty media hash", async function () {
      await expect(
        authenticityToken.connect(owner).mint(
          user1.address, "", sampleBioSignature, sampleHardwareID, sampleIPFSHash
        )
      ).to.be.revertedWith("Media hash cannot be empty");
    });

    it("Should reject duplicate media hash", async function () {
      await authenticityToken.connect(owner).mint(
        user1.address,
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        sampleIPFSHash
      );

      await expect(
        authenticityToken.connect(owner).mint(
          user2.address,
          sampleMediaHash,
          sampleBioSignature,
          sampleHardwareID,
          sampleIPFSHash
        )
      ).to.be.revertedWith("Token already exists for this media");
    });

    it("Should only allow owner to mint", async function () {
      await expect(
        authenticityToken.connect(user1).mint(
          user1.address,
          sampleMediaHash,
          sampleBioSignature,
          sampleHardwareID,
          sampleIPFSHash
        )
      ).to.be.revertedWithCustomError(authenticityToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("Soulbound (non-transferable)", function () {
    beforeEach(async function () {
      await authenticityToken.connect(owner).mint(
        user1.address,
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        sampleIPFSHash
      );
    });

    it("Should block transfers between users", async function () {
      await expect(
        authenticityToken.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWith("Soulbound: Transfer not allowed");
    });

    it("Should block safeTransferFrom", async function () {
      await expect(
        authenticityToken.connect(user1)["safeTransferFrom(address,address,uint256)"](
          user1.address, user2.address, 1
        )
      ).to.be.revertedWith("Soulbound: Transfer not allowed");
    });

    it("Should mark token as soulbound", async function () {
      expect(await authenticityToken.isSoulbound(1)).to.be.true;
    });
  });

  describe("Queries", function () {
    beforeEach(async function () {
      await authenticityToken.connect(owner).mint(
        user1.address,
        sampleMediaHash,
        sampleBioSignature,
        sampleHardwareID,
        sampleIPFSHash
      );
    });

    it("Should check if token exists by media hash", async function () {
      expect(await authenticityToken.exists(sampleMediaHash)).to.be.true;
      expect(await authenticityToken.exists("nonexistent")).to.be.false;
    });

    it("Should get token by media hash", async function () {
      const tokenId = await authenticityToken.getTokenByMediaHash(sampleMediaHash);
      expect(tokenId).to.equal(1);
    });

    it("Should return 0 for nonexistent media hash", async function () {
      const tokenId = await authenticityToken.getTokenByMediaHash("nonexistent");
      expect(tokenId).to.equal(0);
    });
  });

  describe("Pausable", function () {
    it("Should allow owner to pause and unpause", async function () {
      await authenticityToken.connect(owner).pause();

      await expect(
        authenticityToken.connect(owner).mint(
          user1.address, sampleMediaHash, sampleBioSignature, sampleHardwareID, sampleIPFSHash
        )
      ).to.be.revertedWithCustomError(authenticityToken, "EnforcedPause");

      await authenticityToken.connect(owner).unpause();

      // Should work after unpause
      await expect(
        authenticityToken.connect(owner).mint(
          user1.address, sampleMediaHash, sampleBioSignature, sampleHardwareID, sampleIPFSHash
        )
      ).to.emit(authenticityToken, "AuthenticityMinted");
    });

    it("Should prevent non-owner from pausing", async function () {
      await expect(
        authenticityToken.connect(user1).pause()
      ).to.be.revertedWithCustomError(authenticityToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("Burn", function () {
    beforeEach(async function () {
      await authenticityToken.connect(owner).mint(
        user1.address, sampleMediaHash, sampleBioSignature, sampleHardwareID, sampleIPFSHash
      );
    });

    it("Should allow owner to burn a token", async function () {
      await authenticityToken.connect(owner).burn(1);

      // Token should no longer exist
      await expect(authenticityToken.ownerOf(1))
        .to.be.revertedWithCustomError(authenticityToken, "ERC721NonexistentToken");
    });

    it("Should clear associated data on burn", async function () {
      await authenticityToken.connect(owner).burn(1);

      expect(await authenticityToken.exists(sampleMediaHash)).to.be.false;
      const tokenId = await authenticityToken.getTokenByMediaHash(sampleMediaHash);
      expect(tokenId).to.equal(0);
    });

    it("Should prevent non-owner from burning", async function () {
      await expect(
        authenticityToken.connect(user1).burn(1)
      ).to.be.revertedWithCustomError(authenticityToken, "OwnableUnauthorizedAccount");
    });
  });
});
