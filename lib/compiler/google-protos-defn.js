module.exports = {
  fileDescriptorSet: {
    FILE: 1
  },
  fileDescriptorProto: {
    NAME: 1,
    PACKAGE: 2,
    DEPENDENCY: 3,
    MESSAGE_TYPE: 4,
    ENUM_TYPE: 5,
    SERVICE: 6,
    EXTENSION: 7,
    OPTIONS: 8,
    SOURCE_CODE_INFO: 9
  },
  descriptorProto: {
    NAME: 1,
    DOC: 8,
    FIELD: 2,
    EXTENSION: 6,
    NESTED_TYPE: 3,
    ENUM_TYPE: 4,

    extensionRange: {
      START: 1,
      END: 2
    },
    EXTENSION_RANGE: 5,
    OPTIONS: 7
  },
  fieldDescriptorProto: {
    type: {
      TYPE_DOUBLE: 1,
      TYPE_FLOAT: 2,
      TYPE_INT64: 3,
      TYPE_UINT64: 4,
      TYPE_INT32: 5,
      TYPE_FIXED64: 6,
      TYPE_FIXED32: 7,
      TYPE_BOOL: 8,
      TYPE_STRING: 9,
      TYPE_GROUP: 10,
      TYPE_MESSAGE: 11,
      TYPE_BYTES: 12,
      TYPE_UINT32: 13,
      TYPE_ENUM: 14,
      TYPE_SFIXED32: 15,
      TYPE_SFIXED64: 16,
      TYPE_SINT32: 17,
      TYPE_SINT64: 18
    },
    label: {
      LABEL_OPTIONAL: 1,
      LABEL_REQUIRED: 2,
      LABEL_REPEATED: 3
    },
    NAME: 1,
    DOC: 9,
    NUMBER: 3,
    LABEL: 4,
    TYPE: 5,
    TYPE_NAME: 6,
    EXTENDEE: 2,
    DEFAULT_VALUE: 7,
    OPTIONS: 8
  },
  enumDescriptorProto: {
    NAME: 1,
    DOC: 4,
    VALUE: 2,
    OPTIONS: 3
  },
  enumValueDescriptorProto: {
    NAME: 1,
    DOC: 4,
    NUMBER: 2,
    OPTIONS: 3
  },
  serviceDescriptorProto: {
    NAME: 1,
    METHOD: 2,
    DOC: 4,
    OPTIONS: 3
  },
  methodDescriptorProto: {
    NAME: 1,
    DOC: 5,
    INPUT_TYPE: 2,
    OUTPUT_TYPE: 3,
    OPTIONS: 4
  },
  fileOptions: {
    JAVA_PACKAGE: 1,
    JAVA_OUTER_CLASSNAME: 8,
    JAVA_MULTIPLE_FILES: 10,
    GO_PACKAGE: 11,
    JAVA_GENERATE_EQUALS_AND_HASH: 20,
    optimizeMode: {
      SPEED: 1,
      CODE_SIZE: 2,
      LITE_RUNTIME: 3
    },
    OPTIMIZE_FOR: 9,
    CC_GENERIC_SERVICES: 16,
    JAVA_GENERIC_SERVICES: 17,
    PY_GENERIC_SERVICES: 18,
    UNINTERPRETED_OPTION: 999
  },
  messageOptions: {
    MESSAGE_SET_WIRE_FORMAT: 1,
    NO_STANDARD_DESCRIPTOR_ACCESSOR: 2,
    UNINTERPRETED_OPTION: 999
  },
  fieldOptions: {
    CTYPE: 1,
    ctype: {
      STRING: 0,
      CORD: 1,
      STRING_PIECE: 2
    },
    PACKED: 2,
    DEPRECATED: 3,
    EXPERIMENTAL_MAP_KEY: 9,
    UNINTERPRETED_OPTION: 999
  },
  enumOptions: {
    UNINTERPRETED_OPTION: 999
  },
  enumValueOptions: {
    UNINTERPRETED_OPTION: 999
  },
  serviceOptions: {
    UNINTERPRETED_OPTION: 999
  },
  methodOptions: {
    UNINTERPRETED_OPTION: 999
  },
  uninterpretedOption: {
    namePart: {
      NAME_PART: 1,
      IS_EXTENSION: 2
    },
    NAME: 2,
    IDENTIFIER_VALUE: 3,
    POSITIVE_IN_VALUE: 4,
    NEGATIVE_INT_VALUE: 5,
    DOUBLE_VALUE: 6,
    STRING_VALUE: 7,
    AGGREGATE_VALUE: 8
  },
  sourceCodeInfo: {
    LOCATION: 1,
    location: {
      PATH: 1,
      SPAN: 2
    }
  }
};
