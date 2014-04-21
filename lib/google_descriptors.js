module.exports = [
  {
    "name": "google/protobuf/descriptor.proto",
    "package": "google.protobuf",
    "message_type": [
      {
        "name": "FileDescriptorSet",
        "field": [
          {
            "name": "file",
            "number": 1,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.FileDescriptorProto"
          }
        ]
      },
      {
        "name": "FileDescriptorProto",
        "field": [
          {
            "name": "name",
            "number": 1,
            "label": 1,
            "type": 9
          },
          {
            "name": "package",
            "number": 2,
            "label": 1,
            "type": 9
          },
          {
            "name": "dependency",
            "number": 3,
            "label": 3,
            "type": 9
          },
          {
            "name": "message_type",
            "number": 4,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.DescriptorProto"
          },
          {
            "name": "enum_type",
            "number": 5,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.EnumDescriptorProto"
          },
          {
            "name": "service",
            "number": 6,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.ServiceDescriptorProto"
          },
          {
            "name": "extension",
            "number": 7,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.FieldDescriptorProto"
          },
          {
            "name": "options",
            "number": 8,
            "label": 1,
            "type": 11,
            "type_name": ".google.protobuf.FileOptions"
          },
          {
            "name": "source_code_info",
            "number": 9,
            "label": 1,
            "type": 11,
            "type_name": ".google.protobuf.SourceCodeInfo"
          }
        ]
      },
      {
        "name": "DescriptorProto",
        "field": [
          {
            "name": "name",
            "number": 1,
            "label": 1,
            "type": 9
          },
          {
            "name": "doc",
            "number": 8,
            "label": 1,
            "type": 9
          },
          {
            "name": "field",
            "number": 2,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.FieldDescriptorProto"
          },
          {
            "name": "extension",
            "number": 6,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.FieldDescriptorProto"
          },
          {
            "name": "nested_type",
            "number": 3,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.DescriptorProto"
          },
          {
            "name": "enum_type",
            "number": 4,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.EnumDescriptorProto"
          },
          {
            "name": "extension_range",
            "number": 5,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.DescriptorProto.ExtensionRange"
          },
          {
            "name": "options",
            "number": 7,
            "label": 1,
            "type": 11,
            "type_name": ".google.protobuf.MessageOptions"
          }
        ],
        "nested_type": [
          {
            "name": "ExtensionRange",
            "field": [
              {
                "name": "start",
                "number": 1,
                "label": 1,
                "type": 5
              },
              {
                "name": "end",
                "number": 2,
                "label": 1,
                "type": 5
              }
            ]
          }
        ]
      },
      {
        "name": "FieldDescriptorProto",
        "field": [
          {
            "name": "name",
            "number": 1,
            "label": 1,
            "type": 9
          },
          {
            "name": "doc",
            "number": 9,
            "label": 1,
            "type": 9
          },
          {
            "name": "number",
            "number": 3,
            "label": 1,
            "type": 5
          },
          {
            "name": "label",
            "number": 4,
            "label": 1,
            "type": 14,
            "type_name": ".google.protobuf.FieldDescriptorProto.Label"
          },
          {
            "name": "type",
            "number": 5,
            "label": 1,
            "type": 14,
            "type_name": ".google.protobuf.FieldDescriptorProto.Type"
          },
          {
            "name": "type_name",
            "number": 6,
            "label": 1,
            "type": 9
          },
          {
            "name": "extendee",
            "number": 2,
            "label": 1,
            "type": 9
          },
          {
            "name": "default_value",
            "number": 7,
            "label": 1,
            "type": 9
          },
          {
            "name": "options",
            "number": 8,
            "label": 1,
            "type": 11,
            "type_name": ".google.protobuf.FieldOptions"
          }
        ],
        "enum_type": [
          {
            "name": "Type",
            "value": [
              {
                "name": "TYPE_DOUBLE",
                "number": 1
              },
              {
                "name": "TYPE_FLOAT",
                "number": 2
              },
              {
                "name": "TYPE_INT64",
                "number": 3
              },
              {
                "name": "TYPE_UINT64",
                "number": 4
              },
              {
                "name": "TYPE_INT32",
                "number": 5
              },
              {
                "name": "TYPE_FIXED64",
                "number": 6
              },
              {
                "name": "TYPE_FIXED32",
                "number": 7
              },
              {
                "name": "TYPE_BOOL",
                "number": 8
              },
              {
                "name": "TYPE_STRING",
                "number": 9
              },
              {
                "name": "TYPE_GROUP",
                "number": 10
              },
              {
                "name": "TYPE_MESSAGE",
                "number": 11
              },
              {
                "name": "TYPE_BYTES",
                "number": 12
              },
              {
                "name": "TYPE_UINT32",
                "number": 13
              },
              {
                "name": "TYPE_ENUM",
                "number": 14
              },
              {
                "name": "TYPE_SFIXED32",
                "number": 15
              },
              {
                "name": "TYPE_SFIXED64",
                "number": 16
              },
              {
                "name": "TYPE_SINT32",
                "number": 17
              },
              {
                "name": "TYPE_SINT64",
                "number": 18
              }
            ]
          },
          {
            "name": "Label",
            "value": [
              {
                "name": "LABEL_OPTIONAL",
                "number": 1
              },
              {
                "name": "LABEL_REQUIRED",
                "number": 2
              },
              {
                "name": "LABEL_REPEATED",
                "number": 3
              }
            ]
          }
        ]
      },
      {
        "name": "EnumDescriptorProto",
        "field": [
          {
            "name": "name",
            "number": 1,
            "label": 1,
            "type": 9
          },
          {
            "name": "doc",
            "number": 4,
            "label": 1,
            "type": 9
          },
          {
            "name": "value",
            "number": 2,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.EnumValueDescriptorProto"
          },
          {
            "name": "options",
            "number": 3,
            "label": 1,
            "type": 11,
            "type_name": ".google.protobuf.EnumOptions"
          }
        ]
      },
      {
        "name": "EnumValueDescriptorProto",
        "field": [
          {
            "name": "name",
            "number": 1,
            "label": 1,
            "type": 9
          },
          {
            "name": "doc",
            "number": 4,
            "label": 1,
            "type": 9
          },
          {
            "name": "number",
            "number": 2,
            "label": 1,
            "type": 5
          },
          {
            "name": "options",
            "number": 3,
            "label": 1,
            "type": 11,
            "type_name": ".google.protobuf.EnumValueOptions"
          }
        ]
      },
      {
        "name": "ServiceDescriptorProto",
        "field": [
          {
            "name": "name",
            "number": 1,
            "label": 1,
            "type": 9
          },
          {
            "name": "method",
            "number": 2,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.MethodDescriptorProto"
          },
          {
            "name": "doc",
            "number": 4,
            "label": 1,
            "type": 9
          },
          {
            "name": "options",
            "number": 3,
            "label": 1,
            "type": 11,
            "type_name": ".google.protobuf.ServiceOptions"
          }
        ]
      },
      {
        "name": "MethodDescriptorProto",
        "field": [
          {
            "name": "name",
            "number": 1,
            "label": 1,
            "type": 9
          },
          {
            "name": "doc",
            "number": 5,
            "label": 1,
            "type": 9
          },
          {
            "name": "input_type",
            "number": 2,
            "label": 1,
            "type": 9
          },
          {
            "name": "output_type",
            "number": 3,
            "label": 1,
            "type": 9
          },
          {
            "name": "options",
            "number": 4,
            "label": 1,
            "type": 11,
            "type_name": ".google.protobuf.MethodOptions"
          }
        ]
      },
      {
        "name": "FileOptions",
        "field": [
          {
            "name": "java_package",
            "number": 1,
            "label": 1,
            "type": 9
          },
          {
            "name": "java_outer_classname",
            "number": 8,
            "label": 1,
            "type": 9
          },
          {
            "name": "java_multiple_files",
            "number": 10,
            "label": 1,
            "type": 8,
            "default_value": false
          },
          {
            "name": "java_generate_equals_and_hash",
            "number": 20,
            "label": 1,
            "type": 8,
            "default_value": false
          },
          {
            "name": "optimize_for",
            "number": 9,
            "label": 1,
            "type": 14,
            "type_name": ".google.protobuf.FileOptions.OptimizeMode",
            "default_value": "SPEED"
          },
          {
            "name": "cc_generic_services",
            "number": 16,
            "label": 1,
            "type": 8,
            "default_value": false
          },
          {
            "name": "java_generic_services",
            "number": 17,
            "label": 1,
            "type": 8,
            "default_value": false
          },
          {
            "name": "py_generic_services",
            "number": 18,
            "label": 1,
            "type": 8,
            "default_value": false
          },
          {
            "name": "uninterpreted_option",
            "number": 999,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.UninterpretedOption"
          }
        ],
        "enum_type": [
          {
            "name": "OptimizeMode",
            "value": [
              {
                "name": "SPEED",
                "number": 1
              },
              {
                "name": "CODE_SIZE",
                "number": 2
              },
              {
                "name": "LITE_RUNTIME",
                "number": 3
              }
            ]
          }
        ],
        "extension_range": [
          {
            "start": 1000,
            "end": 536870912
          }
        ]
      },
      {
        "name": "MessageOptions",
        "field": [
          {
            "name": "message_set_wire_format",
            "number": 1,
            "label": 1,
            "type": 8,
            "default_value": false
          },
          {
            "name": "no_standard_descriptor_accessor",
            "number": 2,
            "label": 1,
            "type": 8,
            "default_value": false
          },
          {
            "name": "uninterpreted_option",
            "number": 999,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.UninterpretedOption"
          }
        ],
        "extension_range": [
          {
            "start": 1000,
            "end": 536870912
          }
        ]
      },
      {
        "name": "FieldOptions",
        "field": [
          {
            "name": "ctype",
            "number": 1,
            "label": 1,
            "type": 14,
            "type_name": ".google.protobuf.FieldOptions.CType",
            "default_value": "STRING"
          },
          {
            "name": "packed",
            "number": 2,
            "label": 1,
            "type": 8
          },
          {
            "name": "deprecated",
            "number": 3,
            "label": 1,
            "type": 8,
            "default_value": false
          },
          {
            "name": "experimental_map_key",
            "number": 9,
            "label": 1,
            "type": 9
          },
          {
            "name": "uninterpreted_option",
            "number": 999,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.UninterpretedOption"
          }
        ],
        "enum_type": [
          {
            "name": "CType",
            "value": [
              {
                "name": "STRING",
                "number": 0
              },
              {
                "name": "CORD",
                "number": 1
              },
              {
                "name": "STRING_PIECE",
                "number": 2
              }
            ]
          }
        ],
        "extension_range": [
          {
            "start": 1000,
            "end": 536870912
          }
        ]
      },
      {
        "name": "EnumOptions",
        "field": [
          {
            "name": "uninterpreted_option",
            "number": 999,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.UninterpretedOption"
          }
        ],
        "extension_range": [
          {
            "start": 1000,
            "end": 536870912
          }
        ]
      },
      {
        "name": "EnumValueOptions",
        "field": [
          {
            "name": "uninterpreted_option",
            "number": 999,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.UninterpretedOption"
          }
        ],
        "extension_range": [
          {
            "start": 1000,
            "end": 536870912
          }
        ]
      },
      {
        "name": "ServiceOptions",
        "field": [
          {
            "name": "uninterpreted_option",
            "number": 999,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.UninterpretedOption"
          }
        ],
        "extension_range": [
          {
            "start": 1000,
            "end": 536870912
          }
        ]
      },
      {
        "name": "MethodOptions",
        "field": [
          {
            "name": "uninterpreted_option",
            "number": 999,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.UninterpretedOption"
          }
        ],
        "extension_range": [
          {
            "start": 1000,
            "end": 536870912
          }
        ]
      },
      {
        "name": "UninterpretedOption",
        "field": [
          {
            "name": "name",
            "number": 2,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.UninterpretedOption.NamePart"
          },
          {
            "name": "identifier_value",
            "number": 3,
            "label": 1,
            "type": 9
          },
          {
            "name": "positive_int_value",
            "number": 4,
            "label": 1,
            "type": 4
          },
          {
            "name": "negative_int_value",
            "number": 5,
            "label": 1,
            "type": 3
          },
          {
            "name": "double_value",
            "number": 6,
            "label": 1,
            "type": 1
          },
          {
            "name": "string_value",
            "number": 7,
            "label": 1,
            "type": 12
          },
          {
            "name": "aggregate_value",
            "number": 8,
            "label": 1,
            "type": 9
          }
        ],
        "nested_type": [
          {
            "name": "NamePart",
            "field": [
              {
                "name": "name_part",
                "number": 1,
                "label": 2,
                "type": 9
              },
              {
                "name": "is_extension",
                "number": 2,
                "label": 2,
                "type": 8
              }
            ]
          }
        ]
      },
      {
        "name": "SourceCodeInfo",
        "field": [
          {
            "name": "location",
            "number": 1,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.SourceCodeInfo.Location"
          }
        ],
        "nested_type": [
          {
            "name": "Location",
            "field": [
              {
                "name": "path",
                "number": 1,
                "label": 3,
                "type": 5,
                "options": {
                  "ctype": "STRING",
                  "deprecated": false,
                  "lazy": false,
                  "weak": false,
                  "packed": true
                }
              },
              {
                "name": "span",
                "number": 2,
                "label": 3,
                "type": 5,
                "options": {
                  "ctype": "STRING",
                  "deprecated": false,
                  "lazy": false,
                  "weak": false,
                  "packed": true
                }
              }
            ]
          }
        ]
      }
    ],
    "options": {
      "optimize_for": 1,
      "java_multiple_files": false,
      "cc_generic_services": false,
      "java_generic_services": false,
      "py_generic_services": false,
      "java_generate_equals_and_hash": false,
      "java_package": "com.google.protobuf",
      "java_outer_classname": "DescriptorProtos"
    }
  },
  {
    "name": "google/protobuf/compiler/plugin.proto",
    "package": "google.protobuf.compiler",
    "dependency": [
      "google/protobuf/descriptor.proto"
    ],
    "message_type": [
      {
        "name": "CodeGeneratorRequest",
        "field": [
          {
            "name": "file_to_generate",
            "number": 1,
            "label": 3,
            "type": 9
          },
          {
            "name": "parameter",
            "number": 2,
            "label": 1,
            "type": 9
          },
          {
            "name": "proto_file",
            "number": 15,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.FileDescriptorProto"
          }
        ]
      },
      {
        "name": "CodeGeneratorResponse",
        "field": [
          {
            "name": "error",
            "number": 1,
            "label": 1,
            "type": 9
          },
          {
            "name": "file",
            "number": 15,
            "label": 3,
            "type": 11,
            "type_name": ".google.protobuf.compiler.CodeGeneratorResponse.File"
          }
        ],
        "nested_type": [
          {
            "name": "File",
            "field": [
              {
                "name": "name",
                "number": 1,
                "label": 1,
                "type": 9
              },
              {
                "name": "insertion_point",
                "number": 2,
                "label": 1,
                "type": 9
              },
              {
                "name": "content",
                "number": 15,
                "label": 1,
                "type": 9
              }
            ]
          }
        ]
      }
    ],
    "options": {
      "java_package": "com.google.protobuf.compiler",
      "java_outer_classname": "PluginProtos"
    }
  }
];

