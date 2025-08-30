#!/bin/bash

# Voca AI Engine - Service Stop Script
# This script stops Voca AI Engine services using docker compose

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_header() {
    echo -e "${BLUE}🛑 $1${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to check if docker compose is available
check_docker_compose() {
    if ! command -v docker compose &> /dev/null; then
        print_error "docker compose is not installed. Please install it and try again."
        exit 1
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] [SERVICE]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -s, --status        Show status before stopping"
    echo "  -c, --clean         Stop and remove all containers and volumes"
    echo "  -a, --all           Stop all services (default)"
    echo ""
    echo "Services:"
    echo "  engine              Voca AI Engine - Main FastAPI application"
    echo "  voca-os             Voca OS - Node.js Agent Service"
    echo "  voca-connect        Voca Connect - FastAPI AWS Connect Service"
    echo "  postgres            PostgreSQL Database"
    echo ""
    echo "Examples:"
    echo "  $0                  # Stop all services"
    echo "  $0 engine           # Stop only the engine service"
    echo "  $0 --status         # Show status then stop all"
    echo "  $0 --clean          # Stop and remove everything"
    echo "  $0 -s engine        # Show status then stop engine"
}

# Function to show status
show_status() {
    print_info "Current service status:"
    docker compose ps
    echo ""
}

# Function to stop a specific service
stop_service() {
    local service=$1
    print_header "Stopping and removing $service..."
    
    case $service in
        "engine")
            print_info "Stopping and removing Voca AI Engine - Main FastAPI application"
            docker compose stop voca-ai-engine
            docker compose rm -f voca-ai-engine
            ;;
        "voca-os")
            print_info "Stopping and removing Voca OS - Node.js Agent Service"
            docker compose stop voca-os
            docker compose rm -f voca-os
            ;;
        "voca-connect")
            print_info "Stopping and removing Voca Connect - FastAPI AWS Connect Service"
            docker compose stop voca-connect
            docker compose rm -f voca-connect
            ;;
        "postgres")
            print_info "Stopping and removing PostgreSQL Database"
            docker compose stop postgres
            docker compose rm -f postgres
            ;;
        *)
            print_error "Unknown service: $service"
            show_usage
            exit 1
            ;;
    esac
    
    print_status "$service stopped and removed"
}

# Function to stop engine and its dependencies
stop_engine_with_deps() {
    print_header "Stopping engine and its dependencies..."
    print_info "Stopping and removing Voca AI Engine and PostgreSQL Database"
    
    # Stop and remove engine
    docker compose stop voca-ai-engine
    docker compose rm -f voca-ai-engine
    
    # Stop and remove postgres
    docker compose stop postgres
    docker compose rm -f postgres
    
    print_status "Engine and dependencies stopped and removed"
}

# Function to stop all services
stop_all_services() {
    print_header "Stopping and removing all Voca AI Engine services..."
    print_info "Stopping and removing services: engine, voca-os, voca-connect, postgres"
    
    docker compose down --remove-orphans
    
    print_status "All Voca AI Engine services stopped and removed"
    print_info "Services stopped and removed:"
    print_info "  - Voca AI Engine (Port 5008)"
    print_info "  - Voca OS (Port 5001)"
    print_info "  - Voca Connect (Port 5002)"
    print_info "  - PostgreSQL Database (Port 5433)"
}

# Function to clean up
clean_up() {
    print_header "Cleaning up all Voca AI Engine services..."
    print_warning "This will remove all containers, networks, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker compose down -v --remove-orphans
        print_status "All containers, networks, and volumes removed"
    else
        print_info "Cleanup cancelled"
    fi
}

# Function to check if services are running
check_services_running() {
    local running_services=$(docker compose ps --services --filter "status=running" 2>/dev/null || echo "")
    if [ -z "$running_services" ]; then
        print_warning "No Voca AI Engine services are currently running"
        return 1
    fi
    return 0
}

# Main script logic
main() {
    # Check prerequisites
    check_docker
    check_docker_compose
    
    # Check if we're in the right directory
    if [ ! -f "docker-compose.yml" ]; then
        print_error "docker-compose.yml not found. Please run this script from the voca-ai-engine directory."
        exit 1
    fi
    

    
    # Parse arguments
    if [ $# -eq 0 ]; then
        if check_services_running; then
            stop_all_services
        fi
        exit 0
    fi
    
    case "$1" in
        -h|--help)
            show_usage
            ;;
        -s|--status)
            show_status
            if [ $# -gt 1 ]; then
                if [ "$2" = "engine" ]; then
                    stop_engine_with_deps
                else
                    stop_service "$2"
                fi
            else
                if check_services_running; then
                    stop_all_services
                fi
            fi
            ;;
        -c|--clean)
            clean_up
            ;;
        -a|--all)
            if check_services_running; then
                stop_all_services
            fi
            ;;
        engine)
            if check_services_running; then
                stop_engine_with_deps
            fi
            ;;
        voca-os|voca-connect|postgres)
            if check_services_running; then
                stop_service "$1"
            fi
            ;;
        *)
            print_error "Unknown option or service: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
