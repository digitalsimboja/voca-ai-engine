#!/bin/bash

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
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -s, --status        Show status before stopping"
    echo "  -c, --clean         Stop and remove all containers and volumes"
    echo ""
    echo "Examples:"
    echo "  $0                  # Stop all services"
    echo "  $0 --status         # Show status then stop"
    echo "  $0 --clean          # Stop and remove everything"
}

# Function to show status
show_status() {
    print_info "Current service status:"
    docker compose ps
    echo ""
}

# Function to stop all services
stop_all_services() {
    print_header "Stopping all Voca AI services..."
    docker stop $(docker ps -q) && docker rm $(docker ps -aq)
    # docker compose down
    print_status "All services stopped"
}

# Function to clean up
clean_up() {
    print_header "Cleaning up all Voca AI services..."
    print_warning "This will remove all containers, networks, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker compose down -v
        print_status "All containers, networks, and volumes removed"
    else
        print_info "Cleanup cancelled"
    fi
}

# Main script logic
main() {
    # Check prerequisites
    check_docker
    check_docker_compose
    
    # Parse arguments
    if [ $# -eq 0 ]; then
        stop_all_services
        exit 0
    fi
    
    case "$1" in
        -h|--help)
            show_usage
            ;;
        -s|--status)
            show_status
            stop_all_services
            ;;
        -c|--clean)
            clean_up
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
