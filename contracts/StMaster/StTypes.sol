pragma solidity 0.5.8;
pragma experimental ABIEncoderV2;

import "./Owned.sol";

/**
  * Manages ST types
  */
contract StTypes is Owned {
    event AddedSecTokenType(uint256 id, string name);

    // *** ST TYPES
    mapping(uint256 => string) _tokenTypeNames; // typeId -> typeName
    uint256 _count_tokenTypes;
    struct SecTokenTypeReturn {
        uint256 id;
        string  name;
    }
    struct GetSecTokenTypesReturn {
        SecTokenTypeReturn[] tokenTypes;
    }

    constructor() public {}

    /**
     * @dev Adds a new ST type
     * @param name New ST type name
     */
    function addSecTokenType(string memory name) public {
        require(msg.sender == owner, "Restricted method");
        require(_readOnly == false, "Contract is read only");

        for (uint256 tokenTypeId = 0; tokenTypeId < _count_tokenTypes; tokenTypeId++) {
            require(keccak256(abi.encodePacked(_tokenTypeNames[tokenTypeId])) != keccak256(abi.encodePacked(name)),
                    "ST type name already exists");
        }

        _tokenTypeNames[_count_tokenTypes] = name;
        emit AddedSecTokenType(_count_tokenTypes, name);

        _count_tokenTypes++;
    }

    /**
     * @dev Returns current ST types
     */
    function getSecTokenTypes() external view returns (GetSecTokenTypesReturn memory) {
        SecTokenTypeReturn[] memory tokenTypes;
        tokenTypes = new SecTokenTypeReturn[](_count_tokenTypes);

        for (uint256 tokenTypeId = 0; tokenTypeId < _count_tokenTypes; tokenTypeId++) {
            tokenTypes[tokenTypeId] = SecTokenTypeReturn({
                id: tokenTypeId,
              name: _tokenTypeNames[tokenTypeId]
            });
        }

        GetSecTokenTypesReturn memory ret = GetSecTokenTypesReturn({
            tokenTypes: tokenTypes
        });
        return ret;
    }
}
