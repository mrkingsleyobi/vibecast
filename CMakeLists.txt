# Trading Platform - CMake Build Configuration
# Phase 1 Implementation

cmake_minimum_required(VERSION 3.15)
project(TradingPlatform VERSION 1.0.0 LANGUAGES CXX)

# C++ Standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Compiler flags
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -march=native -mtune=native -flto")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -DNDEBUG")
else()
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O0 -g -Wall -Wextra -Wpedantic")
endif()

# Find required packages
find_package(Boost 1.75 REQUIRED COMPONENTS system thread)
find_package(Threads REQUIRED)

# Optional packages
find_package(GTest)
find_package(prometheus-cpp CONFIG)

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/src
    ${Boost_INCLUDE_DIRS}
)

# Library: Core Components
add_library(trading_core
    src/core/fix_parser.cpp
    src/core/order_manager.cpp
    src/core/market_data_receiver.cpp
    src/core/position_tracker.cpp
)

target_link_libraries(trading_core
    ${Boost_LIBRARIES}
    Threads::Threads
)

# Executable: FIX Parser Demo
add_executable(fix_parser_demo src/core/fix_parser.cpp)
target_link_libraries(fix_parser_demo trading_core)

# Executable: Order Manager Demo
add_executable(order_manager_demo src/core/order_manager.cpp)
target_link_libraries(order_manager_demo trading_core)

# Executable: Market Data Receiver Demo
add_executable(market_data_receiver_demo src/core/market_data_receiver.cpp)
target_link_libraries(market_data_receiver_demo trading_core ${Boost_LIBRARIES})

# Executable: Position Tracker Demo
add_executable(position_tracker_demo src/core/position_tracker.cpp)
target_link_libraries(position_tracker_demo trading_core)

# Tests (if GTest is available)
if(GTest_FOUND)
    enable_testing()

    add_executable(fix_parser_test tests/unit/test_fix_parser.cpp)
    target_link_libraries(fix_parser_test trading_core GTest::gtest GTest::gtest_main)
    add_test(NAME FIXParserTest COMMAND fix_parser_test)

    add_executable(order_manager_test tests/unit/test_order_manager.cpp)
    target_link_libraries(order_manager_test trading_core GTest::gtest GTest::gtest_main)
    add_test(NAME OrderManagerTest COMMAND order_manager_test)

    add_executable(position_tracker_test tests/unit/test_position_tracker.cpp)
    target_link_libraries(position_tracker_test trading_core GTest::gtest GTest::gtest_main)
    add_test(NAME PositionTrackerTest COMMAND position_tracker_test)
endif()

# Benchmarks
add_executable(benchmark_suite tests/performance/benchmarks.cpp)
target_link_libraries(benchmark_suite trading_core)

# Install targets
install(TARGETS trading_core DESTINATION lib)
install(TARGETS
    fix_parser_demo
    order_manager_demo
    market_data_receiver_demo
    position_tracker_demo
    DESTINATION bin
)

# Install headers
install(DIRECTORY src/ DESTINATION include/trading_platform
    FILES_MATCHING PATTERN "*.h" PATTERN "*.hpp"
)

# Print configuration
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "C++ compiler: ${CMAKE_CXX_COMPILER}")
message(STATUS "C++ flags: ${CMAKE_CXX_FLAGS}")
message(STATUS "Boost version: ${Boost_VERSION}")
message(STATUS "Boost libraries: ${Boost_LIBRARIES}")
