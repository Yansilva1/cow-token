// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.10;

import "../CowSwapVirtualToken.sol";

contract CowSwapVirtualTokenTestInterface is CowSwapVirtualToken {
    constructor(
        bytes32 merkleRoot,
        address cowToken,
        address payable communityFundsTarget,
        address investorFundsTarget,
        address usdcToken,
        uint256 usdcPrice,
        address gnoToken,
        uint256 gnoPrice,
        address wethToken,
        uint256 wethPrice,
        address teamController
    )
        CowSwapVirtualToken(
            merkleRoot,
            cowToken,
            communityFundsTarget,
            investorFundsTarget,
            usdcToken,
            usdcPrice,
            gnoToken,
            gnoPrice,
            wethToken,
            wethPrice,
            teamController
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function addInstantlySwappableTokensTest(address user, uint256 amount)
        public
    {
        instantlySwappableBalance[user] += amount;
    }

    function increaseTotalSupply(uint256 amount) public {
        totalSupply += amount;
    }

    function addVestingTest(
        address user,
        uint256 amount,
        bool isCancelableFlag
    ) external {
        addVesting(user, amount, isCancelableFlag);
    }
}
